/* node_helper.js – runs server-side in Node.js
 * Fetches Steam deals from CheapShark API and enriches them
 * via the Steam Store API (genres, regional availability).
 */

const NodeHelper = require("node_helper");

// Genre alias map: user-supplied strings → lowercase Steam genre strings.
const GENRE_ALIASES = {
  "multiplayer":   "multi-player",
  "singleplayer":  "single-player",
  "single player": "single-player",
  "multi player":  "multi-player",
  "freetoplay":    "free to play",
  "free-to-play":  "free to play",
  "mmo":           "massively multiplayer",
};

function normalizeGenre(g) {
  const lower = g.toLowerCase().trim();
  return GENRE_ALIASES[lower] ?? lower;
}

// Number of decimal places per currency.
// Most currencies use 2 (cents). Exceptions:
//   0 decimals – whole-unit currencies (JPY, KRW, CLP, IDR, VND)
const CURRENCY_DECIMALS = {
  JPY: 0, KRW: 0, CLP: 0, IDR: 0, VND: 0,
};

// Format a Steam price integer into a localised string.
// Steam returns prices as integers in the smallest unit (e.g. 1499 → 14.99 EUR).
function formatSteamPrice(amountInt, currencyCode) {
  const decimals = CURRENCY_DECIMALS[currencyCode] ?? 2;
  const amount   = amountInt / Math.pow(10, decimals);
  try {
    return new Intl.NumberFormat("en-US", {
      style:                 "currency",
      currency:              currencyCode,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  } catch {
    // Fallback for unknown currency codes
    return decimals === 0
      ? `${Math.round(amount)} ${currencyCode}`
      : `${amount.toFixed(decimals)} ${currencyCode}`;
  }
}

const VALID_SORT_VALUES = new Set([
  "Deal Rating", "Title", "Savings", "Price",
  "Metacritic", "Reviews", "Release", "Store", "recent",
]);

const MAX_FETCH_SIZE    = 60;
const ROTATION_DEAL_POOL = 40;

// Steam Store API country codes (ISO 3166-1 alpha-2).
// Used to check regional availability and to request local prices.
// Any valid Steam cc value works; these are the most common ones.
const VALID_COUNTRIES = new Set([
  "US", "GB", "DE", "FR", "ES", "IT", "NL", "PL", "RU", "UA",
  "BR", "AR", "MX", "CL", "CO", "PE",
  "CN", "JP", "KR", "HK", "TW", "SG", "TH", "MY", "ID", "PH", "IN",
  "AU", "NZ",
  "CA",
  "NO", "SE", "DK", "FI",
  "CH", "AT", "BE", "PT", "CZ", "HU", "RO", "TR",
  "AE", "SA", "ZA",
  "KZ",
]);

module.exports = NodeHelper.create({

  start() {
    console.log("[MMM-SteamDeals] Node helper started");
    this._fetchFn = null;
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "FETCH_DEALS") {
      this.fetchDeals(payload);
    }
  },

  async _getFetch() {
    if (this._fetchFn) return this._fetchFn;
    if (typeof fetch !== "undefined") {
      this._fetchFn = fetch;
    } else {
      this._fetchFn = require("node-fetch");
    }
    return this._fetchFn;
  },

  async fetchDeals({ maxDeals, minDiscount, maxPrice, minSteamRating, minMetacritic, sortBy, sortDescending, genres, rotationEnabled, country }) {
    try {
      const fetchFn = await this._getFetch();

      // Validate country code – fall back to "US" if unknown.
      const cc = (country && VALID_COUNTRIES.has(country.toUpperCase()))
        ? country.toUpperCase()
        : null;

      // Whether we need to call the Steam Store API at all.
      // Required when: genre filter active OR country filter active.
      const needsSteamCall = (genres && genres.length > 0) || cc !== null;

      if (cc) {
        console.log(`[MMM-SteamDeals] Country filter active: ${cc}`);
      }

      // ── 1. Determine how many deals to request from CheapShark ──────────
      const targetPool = rotationEnabled ? ROTATION_DEAL_POOL : maxDeals;
      const needsLocalFilter = minDiscount > 0 || needsSteamCall;
      const fetchSize = Math.min(
        needsLocalFilter ? targetPool * 3 : targetPool,
        MAX_FETCH_SIZE,
      );

      const sortParam = VALID_SORT_VALUES.has(sortBy) ? sortBy : "Deal Rating";

      const params = new URLSearchParams({
        storeID:  "1",
        pageSize: String(fetchSize),
        sortBy:   sortParam,
        desc:     sortDescending ? "1" : "0",
        onSale:   "1",
      });

      if (maxPrice > 0)       params.set("upperBound",  String(maxPrice));
      if (minSteamRating > 0) params.set("steamRating", String(minSteamRating));
      if (minMetacritic > 0)  params.set("metacritic",  String(minMetacritic));

      const dealsUrl = `https://www.cheapshark.com/api/1.0/deals?${params}`;
      console.log(`[MMM-SteamDeals] CheapShark: ${dealsUrl}`);

      const dealsRes = await fetchFn(dealsUrl, {
        headers: { "User-Agent": "MagicMirror-MMM-SteamDeals/1.0" },
        signal:  AbortSignal.timeout(10000),
      });

      if (!dealsRes.ok) throw new Error(`CheapShark HTTP ${dealsRes.status}`);

      let deals = await dealsRes.json();
      console.log(`[MMM-SteamDeals] ${deals.length} deals received from CheapShark`);

      // ── 2. Local discount filter ─────────────────────────────────────────
      if (minDiscount > 0) {
        deals = deals.filter(d => parseFloat(d.savings) >= minDiscount);
        console.log(`[MMM-SteamDeals] After discount filter (>=${minDiscount}%): ${deals.length}`);
      }

      // ── 3. Steam Store API enrichment ────────────────────────────────────
      // Called when genre filter or country filter (or both) are active.
      // A single API call per deal fetches genres + price_overview together,
      // so combining both filters adds zero extra requests vs. either alone.
      if (needsSteamCall) {
        const normalizedGenreFilter = (genres && genres.length > 0)
          ? genres.map(g => normalizeGenre(g))
          : null;

        if (normalizedGenreFilter) {
          console.log(`[MMM-SteamDeals] Genre filter: ${JSON.stringify(normalizedGenreFilter)}`);
        }

        // Only deals with a known Steam AppID can be looked up.
        const withSteamId = deals.filter(d => d.steamAppID && d.steamAppID !== "0");
        console.log(`[MMM-SteamDeals] Deals with Steam AppID: ${withSteamId.length}`);

        const enriched = await this._enrichFromSteam(withSteamId, fetchFn, cc, normalizedGenreFilter !== null);

        deals = enriched.filter(deal => {
          // ── Country filter ──────────────────────────────────────────────
          // If a country was specified and the availability check ran,
          // drop deals that are not available in that region.
          if (cc && !deal.availableInRegion) {
            return false;
          }

          // ── Genre filter ────────────────────────────────────────────────
          if (normalizedGenreFilter) {
            if (!deal.genres || deal.genres.length === 0) return false;
            const dealGenres = deal.genres.map(g => normalizeGenre(g));
            const match = normalizedGenreFilter.some(f => dealGenres.includes(f));
            if (match) {
              console.log(`[MMM-SteamDeals] Genre match: "${deal.title}" [${deal.genres.join(", ")}]`);
            }
            return match;
          }

          return true;
        });

        console.log(`[MMM-SteamDeals] After Steam filter (country + genre): ${deals.length}`);
      } else {
        deals = deals.map(d => ({ ...d, genres: [], availableInRegion: true, localPrice: null, localNormalPrice: null, currency: null }));
      }

      // ── 4. Cap result set and normalise fields ───────────────────────────
      const cap    = rotationEnabled ? targetPool : maxDeals;
      const result = deals.slice(0, cap).map(deal => ({
        title:              deal.title,
        salePrice:          deal.salePrice,
        normalPrice:        deal.normalPrice,
        savings:            deal.savings,
        thumb:              deal.thumb,
        gameID:             deal.gameID,
        steamAppID:         deal.steamAppID,
        dealID:             deal.dealID,
        genres:             deal.genres             || [],
        localPrice:         deal.localPrice         || null,
        localNormalPrice:   deal.localNormalPrice   || null,
        currency:           deal.currency           || null,
        // Score data – already included in the CheapShark response, no extra call needed
        steamRatingPercent: deal.steamRatingPercent || null,  // e.g. "82"
        steamRatingText:    deal.steamRatingText    || null,  // e.g. "Very Positive"
        metacriticScore:    deal.metacriticScore    || null,  // e.g. "86"
      }));

      console.log(`[MMM-SteamDeals] Sending ${result.length} deals (rotation: ${rotationEnabled}, cap: ${cap})`);
      this.sendSocketNotification("DEALS_DATA", result);

    } catch (err) {
      console.error("[MMM-SteamDeals] Error:", err.message);
      this.sendSocketNotification("DEALS_ERROR", err.message);
    }
  },

  // ── Steam Store API: enrich deals with genres and regional availability ───
  //
  // filters used:
  //   price_overview  – present only when the game is purchasable in the region;
  //                     absence means region-locked or not released there.
  //   genres          – included only when genre filter is active (saves bandwidth).
  //
  // A single call fetches both when needed, so country + genre together
  // costs the same as either filter alone.
  async _enrichFromSteam(deals, fetchFn, cc, fetchGenres) {
    const results = [];

    // Build the filters parameter for the Steam API call.
    // Always request price_overview when a country code is set;
    // add genres only when the genre filter is also active.
    const filterParts = [];
    if (cc)           filterParts.push("price_overview");
    if (fetchGenres)  filterParts.push("genres");
    // If neither is needed this method is not called, but guard anyway.
    if (filterParts.length === 0) filterParts.push("basic");
    const filtersParam = filterParts.join(",");

    for (const deal of deals) {
      if (!deal.steamAppID || deal.steamAppID === "0") {
        results.push({ ...deal, genres: [], availableInRegion: true, localPrice: null, localNormalPrice: null, currency: null });
        continue;
      }

      try {
        // cc defaults to "us" when no country filter is set (keeps behaviour
        // identical to the previous version in that case).
        const ccParam = cc || "us";
        const url = `https://store.steampowered.com/api/appdetails?appids=${deal.steamAppID}&filters=${filtersParam}&cc=${ccParam}&l=en`;

        const res = await fetchFn(url, {
          headers: { "User-Agent": "MagicMirror-MMM-SteamDeals/1.0" },
          signal:  AbortSignal.timeout(6000),
        });

        if (!res.ok) {
          console.warn(`[MMM-SteamDeals] Steam API ${res.status} for AppID ${deal.steamAppID}`);
          results.push({ ...deal, genres: [], availableInRegion: true, localPrice: null, localNormalPrice: null, currency: null });
          continue;
        }

        const data    = await res.json();
        const appData = data[deal.steamAppID];

        if (!appData || !appData.success) {
          results.push({ ...deal, genres: [], availableInRegion: false, localPrice: null, localNormalPrice: null, currency: null });
          continue;
        }

        const d = appData.data;

        // Regional availability: price_overview is absent when the game
        // cannot be purchased in the requested country.
        const availableInRegion = cc
          ? (d.price_overview !== undefined || d.is_free === true)
          : true;

        if (cc && !availableInRegion) {
          console.log(`[MMM-SteamDeals] Not available in ${cc}: "${deal.title}"`);
        }

        const genres = (fetchGenres && d.genres)
          ? d.genres.map(g => g.description)
          : [];

        // Extract local prices from price_overview when country is set.
        // Steam provides prices as integers in the smallest currency unit.
        let localPrice       = null;
        let localNormalPrice = null;
        let currency         = null;

        if (cc && d.price_overview) {
          const po         = d.price_overview;
          currency         = po.currency;
          localPrice       = formatSteamPrice(po.final,   currency);
          localNormalPrice = formatSteamPrice(po.initial, currency);
          // If there is no discount the two values are identical – clear normal
          if (po.discount_percent === 0) localNormalPrice = null;
        } else if (cc && d.is_free) {
          currency   = null;
          localPrice = null; // rendered as "Free" by the module
        }

        results.push({ ...deal, genres, availableInRegion, localPrice, localNormalPrice, currency });

        // Brief pause to avoid Steam rate-limiting.
        await new Promise(r => setTimeout(r, 150));

      } catch (err) {
        console.warn(`[MMM-SteamDeals] Failed AppID ${deal.steamAppID}: ${err.message}`);
        // On timeout/network error: keep the deal (fail open).
        results.push({ ...deal, genres: [], availableInRegion: true, localPrice: null, localNormalPrice: null, currency: null });
      }
    }

    return results;
  },
});
