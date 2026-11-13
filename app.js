(function () {
  "use strict";

  // ---------- Defaults ----------
  var SECTIONS = ["Streaming", "Music", "Drive", "Web"];

  // stream: true marks video apps that get locked while the car is moving.
  var DEFAULT_TILES = [
    { name: "YouTube", url: "https://www.youtube.com", section: "Streaming", color: "#e62117", stream: true },
    { name: "Netflix", url: "https://www.netflix.com", section: "Streaming", color: "#b20710", stream: true },
    { name: "Disney+", url: "https://www.disneyplus.com", section: "Streaming", color: "#113ccf", stream: true },
    { name: "Prime Video", url: "https://www.primevideo.com", section: "Streaming", color: "#1399ff", stream: true },
    { name: "Max", url: "https://play.max.com", section: "Streaming", color: "#002be7", stream: true },
    { name: "Hulu", url: "https://www.hulu.com", section: "Streaming", color: "#1ce783", stream: true },
    { name: "Twitch", url: "https://www.twitch.tv", section: "Streaming", color: "#9146ff", stream: true },
    { name: "Plex", url: "https://app.plex.tv", section: "Streaming", color: "#c58a00", stream: true },

    { name: "Spotify", url: "https://open.spotify.com", section: "Music", color: "#1db954" },
    { name: "YouTube Music", url: "https://music.youtube.com", section: "Music", color: "#cc0000" },
    { name: "Apple Music", url: "https://music.apple.com", section: "Music", color: "#fa2d48" },
    { name: "SoundCloud", url: "https://soundcloud.com", section: "Music", color: "#ff5500" },

    { name: "Google Maps", url: "https://maps.google.com", section: "Drive", color: "#34a853" },
    { name: "PlugShare", url: "https://www.plugshare.com", section: "Drive", color: "#2b6cb0" },
    { name: "ABRP", url: "https://abetterrouteplanner.com", section: "Drive", color: "#1f8a70" },
    { name: "Radar", url: "https://www.rainviewer.com/map.html", section: "Drive", color: "#4a5568" },

    { name: "Google", url: "https://www.google.com", section: "Web", color: "#4285f4" },
    { name: "Claude", url: "https://claude.ai", section: "Web", color: "#d97757" },
    { name: "News", url: "https://news.google.com", section: "Web", color: "#5f6368" },
    { name: "Wikipedia", url: "https://www.wikipedia.org", section: "Web", color: "#444" }
  ];

  var DEFAULT_PREFS = { speed: "mph", temp: "f", h24: false, lite: false };

  // ---------- Storage (safe) ----------
  function load(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ }
  }

  var tiles = load("dash.tiles", DEFAULT_TILES.slice());
  var prefs = Object.assign({}, DEFAULT_PREFS, load("dash.prefs", {}));

  var $ = function (id) { return document.getElementById(id); };

  // ---------- Rendering ----------
  var moving = false;

  function render() {
    var root = $("sections");
    var frag = document.createDocumentFragment();
    SECTIONS.forEach(function (sec) {
      var list = tiles.filter(function (t) { return t.section === sec; });
      if (!list.length) return;
      var wrap = document.createElement("section");
      wrap.className = "section";
      var h = document.createElement("h2");
      h.textContent = sec;
      var grid = document.createElement("div");
      grid.className = "grid";
      list.forEach(function (t) { grid.appendChild(tileEl(t)); });
      wrap.appendChild(h);
      wrap.appendChild(grid);
      frag.appendChild(wrap);
    });
    root.replaceChildren(frag);
    applyLock();
  }

  function tileEl(t) {
    var a = document.createElement("a");
    a.className = "tile";
    a.href = t.url;
    a.rel = "noopener";
    if (t.stream) a.dataset.stream = "1";

    var badge = document.createElement("div");
    badge.className = "badge";
    badge.style.background = t.color || "#3e4c5e";
    badge.textContent = (t.name || "?").trim().charAt(0).toUpperCase();

    var name = document.createElement("div");
    name.className = "tile-name";
    name.textContent = t.name;

    var rm = document.createElement("button");
    rm.className = "remove";
    rm.type = "button";
    rm.textContent = "×";
    rm.setAttribute("aria-label", "Remove " + t.name);
    rm.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      tiles = tiles.filter(function (x) { return x !== t; });
      save("dash.tiles", tiles);
      render();
    });

    a.addEventListener("click", function (e) {
      if (document.body.classList.contains("editing") || (t.stream && moving)) e.preventDefault();
    });

    a.appendChild(badge);
    a.appendChild(name);
    a.appendChild(rm);
    return a;
  }

  // ---------- Clock (updates only when the minute changes) ----------
  var lastMinute = -1;
  function tick() {
    var d = new Date();
    if (d.getMinutes() !== lastMinute) {
      lastMinute = d.getMinutes();
      $("clock").textContent = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: !prefs.h24 });
      $("date").textContent = d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
    }
    setTimeout(tick, 1000 - d.getMilliseconds() + 5);
  }

  // ---------- Speed + "parked only" streaming lock ----------
  // GPS speed is in m/s. Hysteresis avoids flicker at stoplights / GPS noise.
  var MOVE_ON = 2.2;   // ~5 mph
  var STOP_AT = 0.5;   // ~1 mph
  var STOP_HOLD_MS = 5000;
  var stoppedSince = 0;
  var lastCoords = null;

  function onPosition(pos) {
    var c = pos.coords;
    lastCoords = c;
    var s = typeof c.speed === "number" && !isNaN(c.speed) ? Math.max(0, c.speed) : null;
    if (s === null) { $("speed").textContent = "--"; }
    else {
      var shown = prefs.speed === "kmh" ? s * 3.6 : s * 2.23694;
      $("speed").textContent = Math.round(shown);
      var now = Date.now();
      if (s >= MOVE_ON) { stoppedSince = 0; setMoving(true); }
      else if (s <= STOP_AT) {
        if (!stoppedSince) stoppedSince = now;
        if (now - stoppedSince >= STOP_HOLD_MS) setMoving(false);
      }
    }
    if (!weatherFetchedAt) fetchWeather();
  }

  function setMoving(m) {
    if (m === moving) return;
    moving = m;
    applyLock();
  }

  function applyLock() {
    $("driveBanner").hidden = !moving;
    var els = document.querySelectorAll('.tile[data-stream="1"]');
    for (var i = 0; i < els.length; i++) els[i].classList.toggle("locked", moving);
  }

  function startGeo() {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.watchPosition(onPosition, function () { /* denied/unavailable */ },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 });
  }

  // ---------- Weather (Open-Meteo, no API key, refreshed every 15 min) ----------
  var weatherFetchedAt = 0;
  var WX = { 0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Fog",
    51: "Drizzle", 53: "Drizzle", 55: "Drizzle", 61: "Rain", 63: "Rain", 65: "Heavy rain",
    71: "Snow", 73: "Snow", 75: "Heavy snow", 80: "Showers", 81: "Showers", 82: "Showers",
    95: "Storms", 96: "Storms", 99: "Storms" };

  function fetchWeather() {
    if (!lastCoords) return;
    weatherFetchedAt = Date.now();
    var url = "https://api.open-meteo.com/v1/forecast?latitude=" + lastCoords.latitude.toFixed(2) +
      "&longitude=" + lastCoords.longitude.toFixed(2) + "&current=temperature_2m,weather_code" +
      "&temperature_unit=" + (prefs.temp === "c" ? "celsius" : "fahrenheit");
    fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      var cur = j && j.current;
      if (!cur) return;
      $("weather").textContent = Math.round(cur.temperature_2m) + "°";
      $("weatherDesc").textContent = WX[cur.weather_code] || "";
    }).catch(function () { weatherFetchedAt = 0; });
  }
  setInterval(function () { if (Date.now() - weatherFetchedAt > 15 * 60 * 1000) fetchWeather(); }, 60 * 1000);

  // ---------- Fullscreen ----------
  // The Tesla browser enters full-screen mode when a page is opened through YouTube's redirect.
  $("fullscreenBtn").addEventListener("click", function () {
    var here = location.href.split("#")[0];
    if (document.documentElement.requestFullscreen && !/Tesla/i.test(navigator.userAgent)) {
      document.documentElement.requestFullscreen().catch(function () {});
      return;
    }
    location.href = "https://www.youtube.com/redirect?q=" + encodeURIComponent(here);
  });

  // ---------- Edit mode ----------
  $("editBtn").addEventListener("click", function () {
    var on = document.body.classList.toggle("editing");
    this.classList.toggle("on", on);
    this.textContent = on ? "Done" : "Edit";
  });

  // ---------- Settings ----------
  var dlg = $("settings");
  function syncSettingsUI() {
    $("optSpeed").value = prefs.speed;
    $("optTemp").value = prefs.temp;
    $("opt24").checked = prefs.h24;
    $("optLite").checked = prefs.lite;
  }
  function applyPrefs() {
    $("speedUnit").textContent = prefs.speed === "kmh" ? "km/h" : "mph";
    document.body.classList.toggle("lite", prefs.lite);
    lastMinute = -1;
  }
  function onPrefChange() {
    var tempChanged = prefs.temp !== $("optTemp").value;
    prefs.speed = $("optSpeed").value;
    prefs.temp = $("optTemp").value;
    prefs.h24 = $("opt24").checked;
    prefs.lite = $("optLite").checked;
    save("dash.prefs", prefs);
    applyPrefs();
    if (tempChanged) fetchWeather();
  }
  ["optSpeed", "optTemp", "opt24", "optLite"].forEach(function (id) { $(id).addEventListener("change", onPrefChange); });

  SECTIONS.forEach(function (s) {
    var o = document.createElement("option"); o.value = s; o.textContent = s; $("newSection").appendChild(o);
  });

  $("settingsBtn").addEventListener("click", function () {
    syncSettingsUI();
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  });

  $("addBtn").addEventListener("click", function () {
    var name = $("newName").value.trim();
    var url = $("newUrl").value.trim();
    if (!name || !url) return;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    try { new URL(url); } catch (e) { return; }
    var hue = Math.floor(Math.random() * 360);
    tiles.push({ name: name, url: url, section: $("newSection").value, color: "hsl(" + hue + ",55%,42%)", stream: $("newStream").checked });
    save("dash.tiles", tiles);
    $("newName").value = ""; $("newUrl").value = ""; $("newStream").checked = false;
    render();
  });

  $("resetBtn").addEventListener("click", function () {
    tiles = DEFAULT_TILES.slice();
    save("dash.tiles", tiles);
    render();
  });

  // ---------- Boot ----------
  applyPrefs();
  render();
  tick();
  startGeo();
})();
