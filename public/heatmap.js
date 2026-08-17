(function () {
  const statusEl = document.getElementById('status');
  const citySelect = document.getElementById('city-selector');
  const unitButtons = document.querySelectorAll('.unit-button');
  const legendEl = document.getElementById('legend');

  let map = null;
  let heatLayer = null;
  let markerLayer = null;
  let cities = [];
  let activeUnit = 'studio';

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function setActiveUnitButton(unit) {
    unitButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.unit === unit);
    });
  }

  async function loadCities() {
    setStatus('Loading cities…');
    const res = await fetch('/api/cities');
    if (!res.ok) throw new Error(`Failed to load cities (${res.status})`);
    const data = await res.json();
    cities = data.cities;

    citySelect.innerHTML = '';
    for (const city of cities) {
      const opt = document.createElement('option');
      opt.value = city.slug;
      opt.textContent = city.label;
      citySelect.appendChild(opt);
    }
  }

  function ensureMap(center, zoom) {
    if (map) return;
    map = L.map('map').setView(center, zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
  }

  function rentColor(rent, min, max) {
    if (min === max) return '#8a2be2';
    const t = (rent - min) / (max - min); // 0 = cheapest, 1 = most expensive
    // green (cheap) -> yellow -> red (expensive)
    const hue = (1 - t) * 120;
    return `hsl(${hue}, 80%, 45%)`;
  }

  async function loadRents(citySlug, unit) {
    setStatus('Loading rent data…');
    const res = await fetch(`/api/rents?city=${encodeURIComponent(citySlug)}&unit=${encodeURIComponent(unit)}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ? `Error: ${body.error}` : `Failed to load rents (${res.status})`);
    }
    return res.json();
  }

  function renderRents(geojson) {
    const { minRent, maxRent } = geojson.meta;

    if (heatLayer) map.removeLayer(heatLayer);
    if (markerLayer) map.removeLayer(markerLayer);

    if (!geojson.features.length) {
      setStatus('No data yet for this city/unit type — the refresh job may not have run yet.');
      legendEl.textContent = '';
      return;
    }

    const heatPoints = geojson.features.map((f) => {
      const [lon, lat] = f.geometry.coordinates;
      const intensity = maxRent === minRent ? 0.5 : (f.properties.medianRent - minRent) / (maxRent - minRent);
      return [lat, lon, 0.3 + intensity * 0.7];
    });

    heatLayer = L.heatLayer(heatPoints, { radius: 45, blur: 35, maxZoom: 14 }).addTo(map);

    markerLayer = L.layerGroup(
      geojson.features.map((f) => {
        const [lon, lat] = f.geometry.coordinates;
        const rent = f.properties.medianRent;
        return L.circleMarker([lat, lon], {
          radius: 6,
          color: rentColor(rent, minRent, maxRent),
          fillColor: rentColor(rent, minRent, maxRent),
          fillOpacity: 0.9,
        }).bindTooltip(
          `<strong>${f.properties.zip}</strong><br>$${rent.toLocaleString()}/mo<br><small>${f.properties.source}</small>`
        );
      })
    ).addTo(map);

    legendEl.textContent = `Range: $${minRent.toLocaleString()} – $${maxRent.toLocaleString()}/mo across ${geojson.features.length} ZIPs`;
    setStatus('');
  }

  async function refresh() {
    const citySlug = citySelect.value;
    const city = cities.find((c) => c.slug === citySlug);
    if (!city) return;

    ensureMap(city.center, city.zoom);
    map.setView(city.center, city.zoom);

    try {
      const geojson = await loadRents(citySlug, activeUnit);
      renderRents(geojson);
    } catch (err) {
      setStatus(err.message || 'Something went wrong loading rent data.');
    }
  }

  citySelect.addEventListener('change', refresh);
  unitButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      activeUnit = btn.dataset.unit;
      setActiveUnitButton(activeUnit);
      refresh();
    });
  });

  (async function init() {
    setActiveUnitButton(activeUnit);
    try {
      await loadCities();
      await refresh();
    } catch (err) {
      setStatus(err.message || 'Failed to initialize.');
    }
  })();
})();
