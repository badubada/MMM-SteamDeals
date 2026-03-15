/* config.example.js
 * Full configuration reference for MMM-SteamDeals.
 * Do NOT include this file directly – copy the values you need into config.js.
 */

{
  module:   "MMM-SteamDeals",
  position: "top_right",   // top_bar | top_left | top_center | top_right
                            // upper_third | middle_center | lower_third
                            // bottom_left | bottom_center | bottom_right | bottom_bar
                            // fullscreen_above | fullscreen_below
  header:   "",

  config: {

    // ── Display ──────────────────────────────────────────────────────────────
    title:          "Steam Deals",
    maxDeals:       5,
    showCovers:     true,
    showSavings:    true,
    // Show Steam user review score and Metacritic score as small badges
    // below the game title. No extra API call – data comes from CheapShark.
    //   Steam badge:      ♥ 82%   (colour: green ≥80 / amber ≥60 / red <60)
    //   Metacritic badge: MC 86   (colour: green ≥75 / amber ≥50 / red <50)
    // Badges are hidden when a score is 0 or not available.
    showScores:     true,
    language:       "en",           // "en" | "de"

    // ── Region ───────────────────────────────────────────────────────────────
    // ISO 3166-1 alpha-2 country code (uppercase).
    // When set, only deals that can actually be purchased in this country
    // are shown. Games that are region-locked, censored, or not released
    // in the specified country are filtered out.
    //
    // Note: When country is set, the module calls the Steam Store API for
    //       every candidate deal to check availability. Initial loading
    //       takes slightly longer (~150 ms per deal).
    //       When combined with the genre filter no extra requests are made –
    //       both checks run in the same single API call per deal.
    //
    // null / "" = no region filter (show all deals, fastest)
    //
    // ── Supported country codes ──────────────────────────────────────────────
    //
    //  Europe:
    //    "DE"  – Germany          "FR"  – France
    //    "GB"  – United Kingdom   "ES"  – Spain
    //    "IT"  – Italy            "NL"  – Netherlands
    //    "PL"  – Poland           "RU"  – Russia
    //    "UA"  – Ukraine          "CH"  – Switzerland
    //    "AT"  – Austria          "BE"  – Belgium
    //    "PT"  – Portugal         "CZ"  – Czech Republic
    //    "HU"  – Hungary          "RO"  – Romania
    //    "TR"  – Turkey           "SE"  – Sweden
    //    "NO"  – Norway           "DK"  – Denmark
    //    "FI"  – Finland
    //
    //  Americas:
    //    "US"  – United States    "CA"  – Canada
    //    "BR"  – Brazil           "AR"  – Argentina
    //    "MX"  – Mexico           "CL"  – Chile
    //    "CO"  – Colombia         "PE"  – Peru
    //
    //  Asia / Pacific:
    //    "CN"  – China            "JP"  – Japan
    //    "KR"  – South Korea      "HK"  – Hong Kong
    //    "TW"  – Taiwan           "SG"  – Singapore
    //    "TH"  – Thailand         "MY"  – Malaysia
    //    "ID"  – Indonesia        "PH"  – Philippines
    //    "IN"  – India            "AU"  – Australia
    //    "NZ"  – New Zealand      "KZ"  – Kazakhstan
    //
    //  Middle East / Africa:
    //    "AE"  – UAE              "SA"  – Saudi Arabia
    //    "ZA"  – South Africa
    //
    // ─────────────────────────────────────────────────────────────────────────
    country:        null,           // e.g. "DE", "GB", "US" – or null to disable

    // ── Filters ──────────────────────────────────────────────────────────────
    minDiscount:    50,             // Minimum discount in percent (0 = off)
    maxPrice:       15,             // Max original price in USD  (0 = off)
    minSteamRating: 0,              // Minimum Steam user score 0–100  (0 = off)
    minMetacritic:  0,              // Minimum Metacritic score 0–100  (0 = off)

    // ── Sorting ──────────────────────────────────────────────────────────────
    // "Deal Rating"  – CheapShark composite score (default)
    // "Savings"      – highest discount first
    // "Price"        – lowest sale price first
    // "Reviews"      – highest Steam user review score → popularity
    // "Metacritic"   – highest Metacritic score → critic rating
    // "Release"      – newest releases first
    // "recent"       – most recently updated deals first
    // "Title"        – alphabetical
    sortBy:           "Deal Rating",
    sortDescending:   true,

    // ── Genre filter ─────────────────────────────────────────────────────────
    // Show only deals matching at least one listed genre.
    // [] = no filter. When combined with country, no extra API requests are made.
    //
    // Main genres:
    //   "Action" | "Adventure" | "Casual" | "Indie" | "RPG" | "Simulation"
    //   "Strategy" | "Sports" | "Racing" | "Massively Multiplayer"
    //   "Early Access" | "Free to Play"
    //
    // Gameplay tags:
    //   "Single-player" | "Multi-player" | "Co-op" | "Online Co-op"
    //   "Local Co-op" | "VR Support"
    //
    // Sub-genres:
    //   "Shooter" | "Puzzle" | "Horror" | "Platformer" | "Open World"
    //   "Tower Defense" | "Card Game" | "Roguelite" | "Roguelike"
    //
    // Note: "Multiplayer" is accepted as alias for "Multi-player" ✓
    genres: [],

    // ── Rotation ─────────────────────────────────────────────────────────────
    rotationEnabled:  false,
    rotationInterval: 10 * 1000,   // ms per page (recommended min: 8000)
    rotationShowPage: true,         // show page dots + countdown bar

    // ── Timing ───────────────────────────────────────────────────────────────
    updateInterval:  30 * 60 * 1000,
    animationSpeed:  1000,
  }
}
