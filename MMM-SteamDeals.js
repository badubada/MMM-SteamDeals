/* MMM-SteamDeals
 * MagicMirror² module – Current Steam deals via CheapShark API
 */

Module.register("MMM-SteamDeals", {

  defaults: {
    // ── Display ──────────────────────────────────────────────────────────────
    title:            "Steam Deals",
    maxDeals:         5,              // Deals shown per page
    showCovers:       true,
    showSavings:      true,
    showScores:       true,           // show Steam & Metacritic score badges
    language:         "en",           // "en" | "de"

    // ── Region ───────────────────────────────────────────────────────────────
    // ISO 3166-1 alpha-2 country code.
    // When set, deals not purchasable in this country are hidden.
    // Also used to display the correct "Free" label for free-to-play games.
    // null / "" = no region filter (show all deals regardless of availability)
    // Valid values → see config.example.js
    country:          null,

    // ── Filters ──────────────────────────────────────────────────────────────
    minDiscount:      50,
    maxPrice:         15,
    minSteamRating:   0,
    minMetacritic:    0,

    // ── Sorting ──────────────────────────────────────────────────────────────
    // "Deal Rating" | "Savings" | "Price" | "Reviews" |
    // "Metacritic"  | "Release" | "recent" | "Title"
    sortBy:           "Deal Rating",
    sortDescending:   true,

    // ── Genre filter ─────────────────────────────────────────────────────────
    // [] = no filter. Valid values → see config.example.js
    genres:           [],

    // ── Rotation ─────────────────────────────────────────────────────────────
    rotationEnabled:  false,
    rotationInterval: 10 * 1000,
    rotationShowPage: true,

    // ── Timing ───────────────────────────────────────────────────────────────
    updateInterval:   30 * 60 * 1000,
    animationSpeed:   1000,
  },

  // ── i18n ─────────────────────────────────────────────────────────────────
  _i18n: {
    en: { loading: "Loading deals…", empty: "No deals found.", updated: "Updated", free: "Free", error: "Error" },
    de: { loading: "Deals werden geladen…", empty: "Keine Deals gefunden.", updated: "Aktualisiert", free: "Kostenlos", error: "Fehler" },
  },

  _t(key) {
    const lang = this.config.language === "de" ? "de" : "en";
    return (this._i18n[lang] || this._i18n.en)[key] || key;
  },

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  start() {
    Log.info("[MMM-SteamDeals] Module started");
    this.deals           = [];
    this.loaded          = false;
    this.error           = null;
    this.lastUpdated     = null;   // timestamp of last successful data fetch
    this.currentPage     = 0;
    this._rotationTimer  = null;
    this._countdownTimer = null;
    this._secondsLeft    = 0;
    this._scheduleUpdate();
  },

  // ── Data fetching ─────────────────────────────────────────────────────────
  _scheduleUpdate() {
    this._fetchDeals();
    setInterval(() => this._fetchDeals(), this.config.updateInterval);
  },

  _fetchDeals() {
    this.sendSocketNotification("FETCH_DEALS", {
      maxDeals:        this.config.maxDeals,
      minDiscount:     this.config.minDiscount,
      maxPrice:        this.config.maxPrice,
      minSteamRating:  this.config.minSteamRating,
      minMetacritic:   this.config.minMetacritic,
      sortBy:          this.config.sortBy,
      sortDescending:  this.config.sortDescending,
      genres:          this.config.genres,
      rotationEnabled: this.config.rotationEnabled,
      country:         this.config.country || null,
    });
  },

  // ── Socket notifications ──────────────────────────────────────────────────
  socketNotificationReceived(notification, payload) {
    if (notification === "DEALS_DATA") {
      this.deals       = payload;
      this.loaded      = true;
      this.error       = null;
      this.lastUpdated = new Date();   // record actual fetch time
      this.currentPage = 0;
      this._stopRotation();
      this.updateDom(this.config.animationSpeed);
      setTimeout(() => this._startRotation(), this.config.animationSpeed + 100);
    } else if (notification === "DEALS_ERROR") {
      this.error  = payload;
      this.loaded = true;
      this._stopRotation();
      this.updateDom(this.config.animationSpeed);
    }
  },

  // ── Rotation helpers ──────────────────────────────────────────────────────
  _totalPages() {
    if (!this.deals || this.deals.length === 0) return 1;
    return Math.ceil(this.deals.length / this.config.maxDeals);
  },

  _dealsForCurrentPage() {
    const start = this.currentPage * this.config.maxDeals;
    return this.deals.slice(start, start + this.config.maxDeals);
  },

  _startRotation() {
    this._stopRotation();
    if (!this.config.rotationEnabled) return;
    const total = this._totalPages();
    if (total <= 1) {
      Log.info("[MMM-SteamDeals] Rotation: only 1 page (deals: " + this.deals.length + ", maxDeals: " + this.config.maxDeals + ")");
      return;
    }
    Log.info(`[MMM-SteamDeals] Rotation started: ${total} pages, ${this.config.rotationInterval}ms`);
    const intervalSec = Math.round(this.config.rotationInterval / 1000);
    this._secondsLeft = intervalSec;
    this._rotationTimer = setInterval(() => {
      this.currentPage  = (this.currentPage + 1) % this._totalPages();
      this._secondsLeft = intervalSec;
      this._stopCountdown();
      this.updateDom(this.config.animationSpeed);
      setTimeout(() => this._startCountdown(intervalSec), this.config.animationSpeed + 100);
    }, this.config.rotationInterval);
    this._startCountdown(intervalSec);
  },

  _stopRotation() {
    this._stopCountdown();
    if (this._rotationTimer) { clearInterval(this._rotationTimer); this._rotationTimer = null; }
  },

  _startCountdown(totalSec) {
    this._stopCountdown();
    this._secondsLeft = totalSec;
    this._updateCountdownDom();
    this._countdownTimer = setInterval(() => {
      this._secondsLeft = Math.max(0, this._secondsLeft - 1);
      this._updateCountdownDom();
    }, 1000);
  },

  _stopCountdown() {
    if (this._countdownTimer) { clearInterval(this._countdownTimer); this._countdownTimer = null; }
  },

  _updateCountdownDom() {
    const label = document.getElementById("sd-countdown-label-" + this.identifier);
    const bar   = document.getElementById("sd-countdown-bar-"   + this.identifier);
    const total = Math.round(this.config.rotationInterval / 1000);
    if (label) label.textContent = this._secondsLeft + "s";
    if (bar)   bar.style.width   = ((this._secondsLeft / total) * 100) + "%";
  },

  // ── Styles ───────────────────────────────────────────────────────────────
  getStyles() {
    return ["MMM-SteamDeals.css"];
  },

  // ── DOM ──────────────────────────────────────────────────────────────────
  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "mmm-steamdeals";

    const header = document.createElement("div");
    header.className = "sd-header";
    header.innerHTML = `<span class="sd-logo">&#9654;</span> ${this.config.title}`;
    wrapper.appendChild(header);

    if (!this.loaded) {
      const el = document.createElement("div");
      el.className   = "sd-loading";
      el.textContent = this._t("loading");
      wrapper.appendChild(el);
      return wrapper;
    }

    if (this.error) {
      const el = document.createElement("div");
      el.className   = "sd-error";
      el.textContent = `${this._t("error")}: ${this.error}`;
      wrapper.appendChild(el);
      return wrapper;
    }

    if (!this.deals || this.deals.length === 0) {
      const el = document.createElement("div");
      el.className   = "sd-empty";
      el.textContent = this._t("empty");
      wrapper.appendChild(el);
      return wrapper;
    }

    const pageDeals = this.config.rotationEnabled
      ? this._dealsForCurrentPage()
      : this.deals;

    const list = document.createElement("ul");
    list.className = "sd-list";

    pageDeals.forEach((deal, idx) => {
      const item = document.createElement("li");
      item.className = "sd-item";
      item.style.animationDelay = `${idx * 80}ms`;

      if (this.config.showCovers && deal.thumb) {
        const img     = document.createElement("img");
        img.className = "sd-cover";
        img.src       = deal.thumb;
        img.alt       = deal.title;
        img.loading   = "lazy";
        img.onerror   = () => { img.style.display = "none"; };
        item.appendChild(img);
      }

      const info = document.createElement("div");
      info.className = "sd-info";

      const titleEl = document.createElement("div");
      titleEl.className   = "sd-title";
      titleEl.textContent = deal.title;
      info.appendChild(titleEl);

      // Score badges (Steam rating + Metacritic)
      if (this.config.showScores) {
        const hasStream = deal.steamRatingPercent && parseInt(deal.steamRatingPercent) > 0;
        const hasMeta   = deal.metacriticScore    && parseInt(deal.metacriticScore)    > 0;

        if (hasStream || hasMeta) {
          const scoreRow = document.createElement("div");
          scoreRow.className = "sd-scores";

          if (hasStream) {
            const pct   = parseInt(deal.steamRatingPercent);
            const tier  = pct >= 80 ? "positive" : pct >= 60 ? "mixed" : "negative";
            const badge = document.createElement("span");
            badge.className   = `sd-score-badge sd-score-steam sd-score-${tier}`;
            badge.title       = deal.steamRatingText || "";
            badge.textContent = `♥ ${pct}%`;
            scoreRow.appendChild(badge);
          }

          if (hasMeta) {
            const score = parseInt(deal.metacriticScore);
            const tier  = score >= 75 ? "positive" : score >= 50 ? "mixed" : "negative";
            const badge = document.createElement("span");
            badge.className   = `sd-score-badge sd-score-meta sd-score-${tier}`;
            badge.title       = "Metacritic";
            badge.textContent = `MC ${score}`;
            scoreRow.appendChild(badge);
          }

          info.appendChild(scoreRow);
        }
      }

      if (deal.genres && deal.genres.length > 0) {
        const row = document.createElement("div");
        row.className = "sd-genres";
        deal.genres.slice(0, 2).forEach(g => {
          const tag       = document.createElement("span");
          tag.className   = "sd-genre-tag";
          tag.textContent = g;
          row.appendChild(tag);
        });
        info.appendChild(row);
      }

      const prices = document.createElement("div");
      prices.className = "sd-prices";

      const sale       = document.createElement("span");
      sale.className   = "sd-sale-price";
      // Use Steam local price when available (country filter active),
      // otherwise fall back to CheapShark USD price.
      if (deal.localPrice) {
        sale.textContent = deal.localPrice;
      } else {
        sale.textContent = deal.salePrice === "0.00" ? this._t("free") : `$${deal.salePrice}`;
      }
      prices.appendChild(sale);

      if (deal.localNormalPrice) {
        const normal       = document.createElement("span");
        normal.className   = "sd-normal-price";
        normal.textContent = deal.localNormalPrice;
        prices.appendChild(normal);
      } else if (!deal.localPrice && deal.normalPrice && deal.normalPrice !== deal.salePrice) {
        const normal       = document.createElement("span");
        normal.className   = "sd-normal-price";
        normal.textContent = `$${deal.normalPrice}`;
        prices.appendChild(normal);
      }

      if (this.config.showSavings && deal.savings) {
        const badge       = document.createElement("span");
        badge.className   = "sd-badge";
        badge.textContent = `-${Math.round(parseFloat(deal.savings))}%`;
        prices.appendChild(badge);
      }

      info.appendChild(prices);
      item.appendChild(info);
      list.appendChild(item);
    });

    wrapper.appendChild(list);

    // ── Rotation indicator ────────────────────────────────────────────────
    if (this.config.rotationEnabled && this.config.rotationShowPage) {
      const totalPages = this._totalPages();
      const indicator  = document.createElement("div");
      indicator.className = "sd-rotation-indicator";

      const dots = document.createElement("div");
      dots.className = "sd-page-dots";
      for (let i = 0; i < Math.max(totalPages, 1); i++) {
        const dot = document.createElement("span");
        dot.className = "sd-dot" + (i === this.currentPage ? " sd-dot-active" : "");
        dots.appendChild(dot);
      }
      indicator.appendChild(dots);

      const countdownWrap = document.createElement("div");
      countdownWrap.className = "sd-countdown";

      const secLabel = document.createElement("span");
      secLabel.className   = "sd-countdown-label";
      secLabel.id          = "sd-countdown-label-" + this.identifier;
      secLabel.textContent = this._secondsLeft + "s";
      countdownWrap.appendChild(secLabel);

      const track = document.createElement("div");
      track.className = "sd-countdown-track";
      const bar = document.createElement("div");
      bar.className = "sd-countdown-bar";
      bar.id        = "sd-countdown-bar-" + this.identifier;
      bar.style.width = ((this._secondsLeft / Math.round(this.config.rotationInterval / 1000)) * 100) + "%";
      track.appendChild(bar);
      countdownWrap.appendChild(track);

      indicator.appendChild(countdownWrap);
      wrapper.appendChild(indicator);
    }

    // Footer – shows the time of the last actual data fetch, not the DOM rebuild time
    const footer = document.createElement("div");
    footer.className = "sd-footer";
    const locale = this.config.language === "de" ? "de-DE" : "en-GB";
    const timeStr = this.lastUpdated
      ? this.lastUpdated.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
      : "–";
    footer.textContent = `${this._t("updated")}: ${timeStr}`;
    wrapper.appendChild(footer);

    return wrapper;
  },
});
