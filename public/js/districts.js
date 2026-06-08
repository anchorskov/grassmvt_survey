/* public/js/districts.js */
/* Wyoming legislative district pair loader and cross-filtering helper. */

window.WyDistricts = (function () {
  var _promise = null;

  function load() {
    if (_promise) return _promise;
    _promise = fetch('/data/wy_legislative_district_pairs.json')
      .then(function (r) { return r.json(); })
      .then(function (pairs) {
        var senateByHouse = {};
        var houseBySenate = {};
        var houseKeys = {};
        var senateKeys = {};
        for (var i = 0; i < pairs.length; i++) {
          var h = pairs[i].house;
          var s = pairs[i].senate;
          houseKeys[h] = true;
          senateKeys[s] = true;
          if (!senateByHouse[h]) senateByHouse[h] = [];
          senateByHouse[h].push(s);
          if (!houseBySenate[s]) houseBySenate[s] = [];
          houseBySenate[s].push(h);
        }
        var allHouseDistricts = Object.keys(houseKeys).sort(function (a, b) {
          return parseInt(a, 10) - parseInt(b, 10);
        });
        var allSenateDistricts = Object.keys(senateKeys).sort(function (a, b) {
          return parseInt(a, 10) - parseInt(b, 10);
        });
        return { pairs: pairs, allHouseDistricts: allHouseDistricts, allSenateDistricts: allSenateDistricts, senateByHouse: senateByHouse, houseBySenate: houseBySenate };
      });
    return _promise;
  }

  /* Populate a <select> element with district options.
   * visible: array of district number strings to show (all if null).
   * selected: string value to pre-select (or '' for blank). */
  function populateSelect(sel, visible, selected, labelPrefix) {
    var current = selected !== undefined ? selected : sel.value;
    sel.innerHTML = '';
    var blank = document.createElement('option');
    blank.value = '';
    blank.textContent = 'Select…';
    sel.appendChild(blank);
    for (var i = 0; i < visible.length; i++) {
      var opt = document.createElement('option');
      opt.value = visible[i];
      opt.textContent = labelPrefix + ' ' + parseInt(visible[i], 10);
      if (visible[i] === current) opt.selected = true;
      sel.appendChild(opt);
    }
  }

  /* Wire up cross-filtering between two <select> elements using the loaded maps.
   * hSel: house <select>, sSel: senate <select>
   * onPairValid(h, s): called when both have values and the pair is valid.
   * onPairInvalid(h, s): called when both have values but the pair is invalid. */
  function wireSelects(maps, hSel, sSel, callbacks) {
    var cb = callbacks || {};

    function refreshHouse(visibleList, newVal) {
      populateSelect(hSel, visibleList || maps.allHouseDistricts, newVal, 'House District');
    }
    function refreshSenate(visibleList, newVal) {
      populateSelect(sSel, visibleList || maps.allSenateDistricts, newVal, 'Senate District');
    }

    function onHouseChange() {
      var h = hSel.value;
      if (!h) {
        refreshSenate(null, sSel.value);
        if (cb.onReset) cb.onReset();
        return;
      }
      var validSenates = maps.senateByHouse[h] || [];
      if (validSenates.length === 1) {
        refreshSenate(validSenates, validSenates[0]);
        if (cb.onPairValid) cb.onPairValid(h, validSenates[0]);
      } else {
        refreshSenate(validSenates.length > 0 ? validSenates : null, '');
        if (cb.onPartial) cb.onPartial();
      }
    }

    function onSenateChange() {
      var s = sSel.value;
      if (!s) {
        refreshHouse(null, hSel.value);
        if (cb.onReset) cb.onReset();
        return;
      }
      var validHouses = maps.houseBySenate[s] || [];
      if (validHouses.length === 1) {
        refreshHouse(validHouses, validHouses[0]);
        if (cb.onPairValid) cb.onPairValid(validHouses[0], s);
      } else {
        refreshHouse(validHouses.length > 0 ? validHouses : null, '');
        if (cb.onPartial) cb.onPartial();
      }
    }

    hSel.addEventListener('change', onHouseChange);
    sSel.addEventListener('change', onSenateChange);

    /* Initial population */
    refreshHouse(null, hSel.value);
    refreshSenate(null, sSel.value);
  }

  /* Validate that a house+senate pair is in the mapping. */
  function isPairValid(maps, house, senate) {
    var senates = maps.senateByHouse[house] || [];
    for (var i = 0; i < senates.length; i++) {
      if (senates[i] === senate) return true;
    }
    return false;
  }

  /* Zero-pad a district number to width digits (matches API expectation). */
  function padDistrict(val, width) {
    var s = String(parseInt(val, 10) || 0);
    while (s.length < width) s = '0' + s;
    return s;
  }

  /* Reset both selects to show all options with no selection. */
  function resetSelects(maps, hSel, sSel) {
    populateSelect(hSel, maps.allHouseDistricts, '', 'House District');
    populateSelect(sSel, maps.allSenateDistricts, '', 'Senate District');
  }

  return { load: load, wireSelects: wireSelects, resetSelects: resetSelects, isPairValid: isPairValid, padDistrict: padDistrict };
})();
