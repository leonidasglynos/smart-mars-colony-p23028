(() => {
  'use strict';

  const KELVIN_OFFSET = 273.15;
  const DIAL_MIN = 8.0;
  const DIAL_MAX = 34.0;
  const DIAL_START_DEG = 135;
  const DIAL_SWEEP_DEG = 270;
  const DIAL_CX = 130;
  const DIAL_CY = 130;
  const DIAL_R = 102;
  const BASE_BATTERY_WH = 120000; // 120 kWh usable energy reserve for autonomy impact estimate
  const BASE_COLONY_LOAD_W = 24000; // Baseline colony draw in W

  const externalSensor = {
    tempC: -60.0,
    source: 'EXT-MET-A1',
    timestamp: 'Sol 142 · 14:20',
    trend: '↘ Ήπια πτώση (-0.4 °C/h)',
    stale: false,
  };

  const rooms = [
    {
      id: 'central-dome',
      code: 'HAB-01',
      name: 'Κεντρικός Θόλος',
      measuredC: 20.0,
      targetC: 20.0,
      safeMin: 16.0,
      safeMax: 26.0,
      areaM2: 500,
      uValue: 0.20,
      sensorId: 'INT-TH-01',
      timestamp: 'Sol 142 · 14:20',
      trend: '→ Σταθερή',
      heaterState: 'Ενεργή · Κανονική',
    },
    {
      id: 'crew-quarters',
      code: 'HAB-02',
      name: 'Κοιτώνες Πληρώματος',
      measuredC: 19.5,
      targetC: 19.5,
      safeMin: 16.0,
      safeMax: 25.0,
      areaM2: 320,
      uValue: 0.18,
      sensorId: 'INT-TH-02',
      timestamp: 'Sol 142 · 14:20',
      trend: '→ Σταθερή',
      heaterState: 'Ενεργή · Κανονική',
    },
    {
      id: 'med-bay',
      code: 'MED-03',
      name: 'Ιατρείο',
      measuredC: 22.0,
      targetC: 22.0,
      safeMin: 19.0,
      safeMax: 25.0,
      areaM2: 180,
      uValue: 0.16,
      sensorId: 'INT-TH-03',
      timestamp: 'Sol 142 · 14:20',
      trend: '→ Σταθερή',
      heaterState: 'Ενεργή · Κρίσιμο φορτίο',
    },
    {
      id: 'fab-lab',
      code: 'LAB-04',
      name: 'Εργαστήριο Κατασκευών',
      measuredC: 18.0,
      targetC: 18.0,
      safeMin: 14.0,
      safeMax: 24.0,
      areaM2: 420,
      uValue: 0.24,
      sensorId: 'INT-TH-04',
      timestamp: 'Sol 142 · 14:20',
      trend: '↗ +0.2 °C/h',
      heaterState: 'Ενεργή · Κανονική',
    },
    {
      id: 'greenhouse',
      code: 'BIO-05',
      name: 'Θερμοκήπιο',
      measuredC: 23.0,
      targetC: 23.0,
      safeMin: 18.0,
      safeMax: 28.0,
      areaM2: 360,
      uValue: 0.28,
      sensorId: 'INT-TH-05',
      timestamp: 'Sol 142 · 14:20',
      trend: '→ Σταθερή',
      heaterState: 'Ενεργή · Θερμική διατήρηση',
    },
    {
      id: 'server-room',
      code: 'SRV-06',
      name: 'Server Room',
      measuredC: 16.5,
      targetC: 16.5,
      safeMin: 12.0,
      safeMax: 22.0,
      areaM2: 140,
      uValue: 0.15,
      sensorId: 'INT-TH-06',
      timestamp: 'Sol 142 · 14:20',
      trend: '↗ +0.1 °C/h',
      heaterState: 'Ψύξη / Ελεγχόμενη',
    },
  ];

  const state = {
    selectedRoomId: rooms[0].id,
    draftTempC: rooms[0].measuredC,
    sensorLost: false,
    isDragging: false,
    execTimer: null,
    execRunning: false,
    lastUndo: null,
    infoNotice: null,
  };

  // DOM References
  const el = {
    tabTemp: document.getElementById('tab-temp'),
    tabIrrigation: document.getElementById('tab-irrigation'),
    panelTemp: document.getElementById('panel-temp'),
    panelIrrigation: document.getElementById('panel-irrigation'),
    activeRoleName: document.getElementById('active-role-name'),

    alertBanner: document.getElementById('alert-banner'),
    alertIcon: document.getElementById('alert-icon'),
    alertSeverity: document.getElementById('alert-severity'),
    alertTitle: document.getElementById('alert-title'),
    alertCause: document.getElementById('alert-cause'),
    alertImpact: document.getElementById('alert-impact'),
    alertAction: document.getElementById('alert-action'),
    alertRecoveryBtn: document.getElementById('alert-recovery-btn'),

    roomList: document.getElementById('room-list'),
    selectedRoomCode: document.getElementById('selected-room-code'),

    inQuality: document.getElementById('in-quality'),
    inTempC: document.getElementById('in-temp-c'),
    inTempK: document.getElementById('in-temp-k'),
    inTrend: document.getElementById('in-trend'),
    inSafeRange: document.getElementById('in-safe-range'),
    inSource: document.getElementById('in-source'),
    inTimestamp: document.getElementById('in-timestamp'),
    inHeaterState: document.getElementById('in-heater-state'),

    outQuality: document.getElementById('out-quality'),
    outTempC: document.getElementById('out-temp-c'),
    outTempK: document.getElementById('out-temp-k'),
    outTrend: document.getElementById('out-trend'),
    outSource: document.getElementById('out-source'),
    outTimestamp: document.getElementById('out-timestamp'),
    deltaTDisplay: document.getElementById('delta-t-display'),

    dialRoomTitle: document.getElementById('dial-room-title'),
    targetStatusTag: document.getElementById('target-status-tag'),
    dialControl: document.getElementById('dial-control'),
    dialTrack: document.getElementById('dial-track'),
    dialSafeArc: document.getElementById('dial-safe-arc'),
    dialActiveArc: document.getElementById('dial-active-arc'),
    dialMeasuredMarker: document.getElementById('dial-measured-marker'),
    dialThumbOuter: document.getElementById('dial-thumb-outer'),
    dialThumbInner: document.getElementById('dial-thumb-inner'),
    dialModeLabel: document.getElementById('dial-mode-label'),
    dialTempC: document.getElementById('dial-temp-c'),
    dialTempK: document.getElementById('dial-temp-k'),
    dialDelta: document.getElementById('dial-delta'),

    btnDec: document.getElementById('btn-dec'),
    btnInc: document.getElementById('btn-inc'),
    tempNumericInput: document.getElementById('temp-numeric-input'),

    powerDeltaBadge: document.getElementById('power-delta-badge'),
    currentPowerVal: document.getElementById('current-power-val'),
    estimatedPowerVal: document.getElementById('estimated-power-val'),
    autonomyImpactNote: document.getElementById('autonomy-impact-note'),
    modelParamsLine: document.getElementById('model-params-line'),
    modelCalcLine: document.getElementById('model-calc-line'),

    btnReset: document.getElementById('btn-reset'),
    btnApply: document.getElementById('btn-apply'),

    executionPanel: document.getElementById('execution-panel'),
    execStageLabel: document.getElementById('exec-stage-label'),
    execTitle: document.getElementById('exec-title'),
    execPercent: document.getElementById('exec-percent'),
    execProgressbar: document.getElementById('exec-progressbar'),
    execProgressFill: document.getElementById('exec-progress-fill'),
    stepAccepted: document.getElementById('step-accepted'),
    stepRunning: document.getElementById('step-running'),
    stepDone: document.getElementById('step-done'),
    execDetail: document.getElementById('exec-detail'),
    btnUndoExec: document.getElementById('btn-undo-exec'),
    btnDismissExec: document.getElementById('btn-dismiss-exec'),

    simSensorLoss: document.getElementById('sim-sensor-loss'),
    simStaleOut: document.getElementById('sim-stale-out'),
    simOutOfBounds: document.getElementById('sim-out-of-bounds'),

    confirmModal: document.getElementById('confirm-modal'),
    modalSummary: document.getElementById('modal-summary'),
    modalCancel: document.getElementById('modal-cancel'),
    modalConfirm: document.getElementById('modal-confirm'),
  };

  // Helpers
  function toKelvin(c) {
    return c + KELVIN_OFFSET;
  }

  function formatWatts(w) {
    return `${Math.round(w).toLocaleString('el-GR')} W`;
  }

  function getSelectedRoom() {
    return rooms.find((r) => r.id === state.selectedRoomId) || rooms[0];
  }

  function calcHeatLossW(room, tempInC) {
    const tInK = toKelvin(tempInC);
    const tOutK = toKelvin(externalSensor.tempC);
    return Math.max(0, room.uValue * room.areaM2 * (tInK - tOutK));
  }

  function polarToCartesian(cx, cy, r, angleDeg) {
    const rad = (angleDeg * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad),
    };
  }

  function describeArc(cx, cy, r, startDeg, endDeg) {
    const sweep = endDeg - startDeg;
    if (sweep <= 0.01) return '';
    const start = polarToCartesian(cx, cy, r, startDeg);
    const end = polarToCartesian(cx, cy, r, endDeg);
    const largeArc = sweep > 180 ? 1 : 0;
    return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  }

  function tempToAngle(tempC) {
    const clamped = Math.max(DIAL_MIN, Math.min(DIAL_MAX, tempC));
    const ratio = (clamped - DIAL_MIN) / (DIAL_MAX - DIAL_MIN);
    return DIAL_START_DEG + ratio * DIAL_SWEEP_DEG;
  }

  function roundHalf(val) {
    return Math.round(val * 2) / 2;
  }

  function isTempValidForRoom(room, tempC) {
    return Number.isFinite(tempC) && tempC >= room.safeMin && tempC <= room.safeMax;
  }

  // Render Functions
  function renderRoomList() {
    el.roomList.innerHTML = '';
    rooms.forEach((room) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `room-item${room.id === state.selectedRoomId ? ' is-selected' : ''}`;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', String(room.id === state.selectedRoomId));

      const isLostHere = state.sensorLost && room.id === state.selectedRoomId;
      const dotClass = isLostHere ? 'status-dot is-danger' : 'status-dot';
      const tempText = isLostHere ? '— °C' : `${room.measuredC.toFixed(1)} °C`;
      const kelvinText = isLostHere ? '— K' : `${toKelvin(room.measuredC).toFixed(2)} K`;

      btn.innerHTML = `
        <div class="room-item-top">
          <span class="room-name">${room.name}</span>
          <span class="${dotClass}" aria-hidden="true"></span>
        </div>
        <div class="room-temp-pair">
          <strong>${tempText}</strong>
          <span>${kelvinText}</span>
        </div>
      `;

      btn.addEventListener('click', () => {
        if (state.execRunning) return;
        state.selectedRoomId = room.id;
        state.draftTempC = room.measuredC;
        state.infoNotice = null;
        renderAll();
      });

      el.roomList.appendChild(btn);
    });
  }

  function renderSensors(room) {
    el.selectedRoomCode.textContent = room.code;
    el.inSource.textContent = room.sensorId;
    el.inSafeRange.textContent = `Ασφαλές εύρος: ${room.safeMin.toFixed(1)}–${room.safeMax.toFixed(1)} °C`;

    if (state.sensorLost) {
      el.inQuality.className = 'quality-badge quality-danger';
      el.inQuality.innerHTML = '<span class="q-symbol" aria-hidden="true">✕</span> Απώλεια σήματος';
      el.inTempC.textContent = '— °C';
      el.inTempK.textContent = '— K';
      el.inTrend.textContent = 'Μη διαθέσιμη μέτρηση';
      el.inTimestamp.textContent = 'Τελευταία: πριν 18 λεπτά';
      el.inHeaterState.textContent = 'Ασφαλής αναμονή (Hold)';
    } else {
      el.inQuality.className = 'quality-badge quality-ok';
      el.inQuality.innerHTML = '<span class="q-symbol" aria-hidden="true">●</span> Αξιόπιστη';
      el.inTempC.textContent = `${room.measuredC.toFixed(1)} °C`;
      el.inTempK.textContent = `${toKelvin(room.measuredC).toFixed(2)} K`;
      el.inTrend.textContent = room.trend;
      el.inTimestamp.textContent = room.timestamp;
      el.inHeaterState.textContent = room.heaterState;
    }

    el.outTempC.textContent = `${externalSensor.tempC.toFixed(1)} °C`;
    el.outTempK.textContent = `${toKelvin(externalSensor.tempC).toFixed(2)} K`;
    el.outSource.textContent = externalSensor.source;
    el.outTrend.textContent = externalSensor.trend;

    if (externalSensor.stale) {
      el.outQuality.className = 'quality-badge quality-warn';
      el.outQuality.innerHTML = '<span class="q-symbol" aria-hidden="true">▲</span> Παρωχημένη';
      el.outTimestamp.textContent = 'Sol 142 · 13:35 (45′ πριν)';
    } else {
      el.outQuality.className = 'quality-badge quality-ok';
      el.outQuality.innerHTML = '<span class="q-symbol" aria-hidden="true">●</span> Αξιόπιστη';
      el.outTimestamp.textContent = externalSensor.timestamp;
    }

    if (state.sensorLost) {
      el.deltaTDisplay.textContent = 'Μη υπολογίσιμη';
    } else {
      const dt = room.measuredC - externalSensor.tempC;
      el.deltaTDisplay.textContent = `${dt.toFixed(1)} K (${dt.toFixed(1)} °C)`;
    }
  }

  function renderDial(room) {
    el.dialRoomTitle.textContent = room.name;

    const valid = isTempValidForRoom(room, state.draftTempC);
    const disabled = state.sensorLost || state.execRunning;

    el.dialControl.classList.toggle('is-disabled', disabled);
    el.dialControl.setAttribute('aria-valuenow', String(state.draftTempC));
    el.dialControl.setAttribute(
      'aria-valuetext',
      `${state.draftTempC.toFixed(1)} βαθμοί Κελσίου, ${toKelvin(state.draftTempC).toFixed(2)} Κέλβιν`
    );

    // Draw Track, Safe Arc, Active Arc, Markers
    el.dialTrack.setAttribute('d', describeArc(DIAL_CX, DIAL_CY, DIAL_R, DIAL_START_DEG, DIAL_START_DEG + DIAL_SWEEP_DEG));
    el.dialSafeArc.setAttribute('d', describeArc(DIAL_CX, DIAL_CY, DIAL_R, tempToAngle(room.safeMin), tempToAngle(room.safeMax)));

    const currentAngle = tempToAngle(state.draftTempC);
    el.dialActiveArc.setAttribute('d', describeArc(DIAL_CX, DIAL_CY, DIAL_R, DIAL_START_DEG, currentAngle));
    el.dialActiveArc.classList.toggle('is-danger', !valid);

    const measuredPos = polarToCartesian(DIAL_CX, DIAL_CY, DIAL_R, tempToAngle(room.measuredC));
    el.dialMeasuredMarker.setAttribute('cx', measuredPos.x.toFixed(2));
    el.dialMeasuredMarker.setAttribute('cy', measuredPos.y.toFixed(2));
    el.dialMeasuredMarker.style.display = state.sensorLost ? 'none' : 'block';

    const thumbPos = polarToCartesian(DIAL_CX, DIAL_CY, DIAL_R, currentAngle);
    el.dialThumbOuter.setAttribute('cx', thumbPos.x.toFixed(2));
    el.dialThumbOuter.setAttribute('cy', thumbPos.y.toFixed(2));
    el.dialThumbInner.setAttribute('cx', thumbPos.x.toFixed(2));
    el.dialThumbInner.setAttribute('cy', thumbPos.y.toFixed(2));
    el.dialThumbOuter.classList.toggle('is-danger', !valid);
    el.dialThumbInner.classList.toggle('is-danger', !valid);

    // Center text (both °C and K)
    el.dialTempC.textContent = `${state.draftTempC.toFixed(1)} °C`;
    el.dialTempK.textContent = `${toKelvin(state.draftTempC).toFixed(2)} K`;

    if (state.sensorLost) {
      el.dialModeLabel.textContent = 'Κλειδωμένο';
      el.dialDelta.textContent = 'Αναμονή αισθητήρα';
      el.targetStatusTag.textContent = 'Μη διαθέσιμος αισθητήρας';
      el.targetStatusTag.className = 'status-tag is-disabled';
    } else if (!valid) {
      el.dialModeLabel.textContent = 'Εκτός ορίων';
      el.dialDelta.textContent = `Επιτρεπτό: ${room.safeMin.toFixed(1)}–${room.safeMax.toFixed(1)} °C`;
      el.targetStatusTag.textContent = 'Εκτός ασφαλών ορίων';
      el.targetStatusTag.className = 'status-tag is-danger';
    } else {
      el.dialModeLabel.textContent = 'Επιθυμητή';
      const diff = state.draftTempC - room.measuredC;
      if (Math.abs(diff) < 0.05) {
        el.dialDelta.textContent = 'Ίδια με μετρούμενη';
      } else {
        const sign = diff > 0 ? '+' : '';
        el.dialDelta.textContent = `${sign}${diff.toFixed(1)} °C (${sign}${diff.toFixed(1)} K)`;
      }
      el.targetStatusTag.textContent = 'Εντός ασφαλών ορίων';
      el.targetStatusTag.className = 'status-tag';
    }

    el.tempNumericInput.value = state.draftTempC.toFixed(1);
    el.tempNumericInput.disabled = disabled;
    el.btnDec.disabled = disabled;
    el.btnInc.disabled = disabled;
  }

  function renderImpact(room) {
    const valid = isTempValidForRoom(room, state.draftTempC);
    const changed = Math.abs(state.draftTempC - room.measuredC) >= 0.05;

    if (state.sensorLost) {
      el.currentPowerVal.textContent = '— W';
      el.estimatedPowerVal.textContent = '— W';
      el.powerDeltaBadge.textContent = 'Αδύνατος υπολογισμός';
      el.powerDeltaBadge.className = 'delta-badge neutral';
      el.autonomyImpactNote.textContent = 'Απαιτείται έγκυρη μέτρηση αισθητήρα';
      el.modelParamsLine.textContent = `Χώρος: ${room.name} · U = ${room.uValue.toFixed(2)} W/(m²·K), A = ${room.areaM2} m²`;
      el.modelCalcLine.textContent = 'Δεν υπάρχει διαθέσιμη μέτρηση Tεντ.';
      el.btnReset.disabled = true;
      el.btnApply.disabled = true;
      return;
    }

    const qCurrent = calcHeatLossW(room, room.measuredC);
    const qNew = calcHeatLossW(room, state.draftTempC);
    const deltaQ = qNew - qCurrent;
    const pct = qCurrent > 0 ? (deltaQ / qCurrent) * 100 : 0;

    el.currentPowerVal.textContent = formatWatts(qCurrent);
    el.estimatedPowerVal.textContent = formatWatts(qNew);

    if (Math.abs(deltaQ) < 1) {
      el.powerDeltaBadge.textContent = '0 W (0.0%)';
      el.powerDeltaBadge.className = 'delta-badge neutral';
      el.autonomyImpactNote.textContent = 'Καμία μεταβολή αυτονομίας';
    } else if (deltaQ > 0) {
      el.powerDeltaBadge.textContent = `+${formatWatts(deltaQ)} (+${pct.toFixed(1)}%)`;
      el.powerDeltaBadge.className = 'delta-badge increase';
      const oldHours = BASE_BATTERY_WH / BASE_COLONY_LOAD_W;
      const newHours = BASE_BATTERY_WH / (BASE_COLONY_LOAD_W + deltaQ);
      const diffMin = Math.round((oldHours - newHours) * 60);
      el.autonomyImpactNote.textContent = `Αυξημένο φορτίο · ~${diffMin}′ λιγότερη εφεδρική αυτονομία`;
    } else {
      el.powerDeltaBadge.textContent = `−${formatWatts(Math.abs(deltaQ))} (${pct.toFixed(1)}%)`;
      el.powerDeltaBadge.className = 'delta-badge decrease';
      const oldHours = BASE_BATTERY_WH / BASE_COLONY_LOAD_W;
      const newHours = BASE_BATTERY_WH / Math.max(1000, BASE_COLONY_LOAD_W + deltaQ);
      const diffMin = Math.round((newHours - oldHours) * 60);
      el.autonomyImpactNote.textContent = `Εξοικονόμηση · ~${diffMin}′ επιπλέον εφεδρική αυτονομία`;
    }

    const tInK = toKelvin(state.draftTempC);
    const tOutK = toKelvin(externalSensor.tempC);
    el.modelParamsLine.textContent = `Παράμετροι (${room.name}): U = ${room.uValue.toFixed(2)} W/(m²·K), A = ${room.areaM2} m², Tεντ = ${tInK.toFixed(2)} K, Tεκτ = ${tOutK.toFixed(2)} K`;
    el.modelCalcLine.textContent = `Υπολογισμός: Q̇ = ${room.uValue.toFixed(2)} × ${room.areaM2} × (${tInK.toFixed(2)} − ${tOutK.toFixed(2)}) = ${formatWatts(qNew)}`;

    el.btnReset.disabled = !changed || state.execRunning;
    el.btnApply.disabled = !changed || !valid || state.execRunning;
  }

  function renderAlert(room) {
    const valid = isTempValidForRoom(room, state.draftTempC);
    el.alertRecoveryBtn.hidden = true;
    el.alertRecoveryBtn.onclick = null;

    if (state.sensorLost) {
      el.alertBanner.className = 'alert-banner';
      el.alertIcon.textContent = '✕';
      el.alertSeverity.textContent = 'ΚΡΙΣΙΜΟ ΣΦΑΛΜΑ';
      el.alertTitle.textContent = `Απώλεια μέτρησης εσωτερικού αισθητήρα (${room.sensorId})`;
      el.alertCause.textContent = `Αιτία: Δεν λαμβάνεται έγκυρο σήμα θερμοκρασίας από τον χώρο «${room.name}».`;
      el.alertImpact.textContent = 'Επίπτωση: Αδύνατος ο ασφαλής υπολογισμός ενεργειακής επίπτωσης. Η μεταβολή ρύθμισης έχει κλειδωθεί.';
      el.alertAction.textContent = 'Προτεινόμενη ενέργεια: Επαναφέρετε τη σύνδεση του αισθητήρα ή μεταβείτε σε εφεδρικό αισθητήρα πριν από νέα εντολή.';
      el.alertRecoveryBtn.hidden = false;
      el.alertRecoveryBtn.textContent = 'Επανασύνδεση αισθητήρα';
      el.alertRecoveryBtn.onclick = () => {
        state.sensorLost = false;
        el.simSensorLoss.checked = false;
        renderAll();
      };
      return;
    }

    if (!valid) {
      el.alertBanner.className = 'alert-banner';
      el.alertIcon.textContent = '!';
      el.alertSeverity.textContent = 'ΕΚΤΟΣ ΟΡΙΩΝ';
      el.alertTitle.textContent = `Μη αποδεκτή τιμή θερμοκρασίας (${state.draftTempC.toFixed(1)} °C / ${toKelvin(state.draftTempC).toFixed(2)} K)`;
      el.alertCause.textContent = `Αιτία: Η τιμή υπερβαίνει τα όρια ασφαλείας του χώρου «${room.name}» (${room.safeMin.toFixed(1)}–${room.safeMax.toFixed(1)} °C).`;
      el.alertImpact.textContent = 'Επίπτωση: Κίνδυνος θερμικής καταπόνησης εξοπλισμού ή πληρώματος. Η αποστολή εντολής απορρίπτεται.';
      el.alertAction.textContent = `Προτεινόμενη ενέργεια: Ορίστε τιμή μεταξύ ${room.safeMin.toFixed(1)} °C και ${room.safeMax.toFixed(1)} °C ή πατήστε επαναφορά.`;
      el.alertRecoveryBtn.hidden = false;
      el.alertRecoveryBtn.textContent = 'Επαναφορά σε ασφαλή τιμή';
      el.alertRecoveryBtn.onclick = () => {
        state.draftTempC = Math.max(room.safeMin, Math.min(room.safeMax, room.measuredC));
        renderAll();
      };
      return;
    }

    if (externalSensor.stale) {
      el.alertBanner.className = 'alert-banner is-warning';
      el.alertIcon.textContent = '▲';
      el.alertSeverity.textContent = 'ΠΡΟΕΙΔΟΠΟΙΗΣΗ';
      el.alertTitle.textContent = 'Παρωχημένη μέτρηση εξωτερικής θερμοκρασίας';
      el.alertCause.textContent = `Αιτία: Η τελευταία ενημέρωση από τον ${externalSensor.source} έγινε πριν από 45 λεπτά.`;
      el.alertImpact.textContent = 'Επίπτωση: Η εκτίμηση θερμικών απωλειών Q̇ ενδέχεται να αποκλίνει από την πραγματική απαίτηση.';
      el.alertAction.textContent = 'Προτεινόμενη ενέργεια: Επαληθεύστε την εξωτερική πηγή πριν από την επιβεβαίωση της εντολής.';
      el.alertRecoveryBtn.hidden = false;
      el.alertRecoveryBtn.textContent = 'Επαλήθευση πηγής';
      el.alertRecoveryBtn.onclick = () => {
        externalSensor.stale = false;
        el.simStaleOut.checked = false;
        renderAll();
      };
      return;
    }

    if (state.infoNotice) {
      el.alertBanner.className = 'alert-banner is-info';
      el.alertIcon.textContent = 'i';
      el.alertSeverity.textContent = 'ΕΝΗΜΕΡΩΣΗ';
      el.alertTitle.textContent = state.infoNotice.title;
      el.alertCause.textContent = state.infoNotice.body;
      el.alertImpact.textContent = '';
      el.alertAction.textContent = '';
      el.alertRecoveryBtn.hidden = false;
      el.alertRecoveryBtn.textContent = 'Κλείσιμο';
      el.alertRecoveryBtn.onclick = () => {
        state.infoNotice = null;
        renderAll();
      };
      return;
    }

    el.alertBanner.className = 'alert-banner is-hidden';
  }

  function renderAll() {
    const room = getSelectedRoom();
    renderRoomList();
    renderSensors(room);
    renderDial(room);
    renderImpact(room);
    renderAlert(room);
  }

  // Dial Interaction (Pointer + Keyboard)
  function updateTempFromPointer(clientX, clientY) {
    if (state.sensorLost || state.execRunning) return;
    const rect = el.dialControl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;

    let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (deg < 0) deg += 360;

    // Relative angle clockwise from DIAL_START_DEG (135 deg)
    let rel = (deg - DIAL_START_DEG + 360) % 360;
    if (rel > DIAL_SWEEP_DEG) {
      // Dead zone at bottom (270..360, midpoint 315)
      rel = rel < 315 ? DIAL_SWEEP_DEG : 0;
    }

    const ratio = rel / DIAL_SWEEP_DEG;
    const nextTemp = roundHalf(DIAL_MIN + ratio * (DIAL_MAX - DIAL_MIN));
    if (nextTemp !== state.draftTempC) {
      state.draftTempC = nextTemp;
      state.infoNotice = null;
      renderAll();
    }
  }

  el.dialControl.addEventListener('pointerdown', (e) => {
    if (state.sensorLost || state.execRunning) return;
    state.isDragging = true;
    el.dialControl.setPointerCapture(e.pointerId);
    updateTempFromPointer(e.clientX, e.clientY);
  });

  el.dialControl.addEventListener('pointermove', (e) => {
    if (!state.isDragging) return;
    updateTempFromPointer(e.clientX, e.clientY);
  });

  function stopDrag(e) {
    if (!state.isDragging) return;
    state.isDragging = false;
    if (el.dialControl.hasPointerCapture(e.pointerId)) {
      el.dialControl.releasePointerCapture(e.pointerId);
    }
  }

  el.dialControl.addEventListener('pointerup', stopDrag);
  el.dialControl.addEventListener('pointercancel', stopDrag);

  el.dialControl.addEventListener('keydown', (e) => {
    if (state.sensorLost || state.execRunning) return;
    let delta = 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') delta = 0.5;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') delta = -0.5;
    else if (e.key === 'PageUp') delta = 2.0;
    else if (e.key === 'PageDown') delta = -2.0;
    else return;

    e.preventDefault();
    state.draftTempC = Math.max(DIAL_MIN, Math.min(DIAL_MAX, roundHalf(state.draftTempC + delta)));
    state.infoNotice = null;
    renderAll();
  });

  // Fine Buttons & Numeric Input
  el.btnDec.addEventListener('click', () => {
    if (state.sensorLost || state.execRunning) return;
    state.draftTempC = Math.max(-10, roundHalf(state.draftTempC - 0.5));
    state.infoNotice = null;
    renderAll();
  });

  el.btnInc.addEventListener('click', () => {
    if (state.sensorLost || state.execRunning) return;
    state.draftTempC = Math.min(50, roundHalf(state.draftTempC + 0.5));
    state.infoNotice = null;
    renderAll();
  });

  el.tempNumericInput.addEventListener('input', () => {
    const val = parseFloat(el.tempNumericInput.value);
    if (!Number.isFinite(val)) return;
    state.draftTempC = val;
    state.infoNotice = null;
    const room = getSelectedRoom();
    renderDial(room);
    renderImpact(room);
    renderAlert(room);
  });

  el.btnReset.addEventListener('click', () => {
    const room = getSelectedRoom();
    state.draftTempC = room.measuredC;
    state.infoNotice = null;
    renderAll();
  });

  // Modal Confirmation & Cancellation
  function openConfirmModal() {
    const room = getSelectedRoom();
    const qCurrent = calcHeatLossW(room, room.measuredC);
    const qNew = calcHeatLossW(room, state.draftTempC);
    const deltaQ = qNew - qCurrent;
    const sign = deltaQ >= 0 ? '+' : '−';

    el.modalSummary.innerHTML = `
      <div class="summary-row"><span>Χώρος</span><strong>${room.name} (${room.code})</strong></div>
      <div class="summary-row"><span>Τρέχουσα θερμοκρασία</span><strong>${room.measuredC.toFixed(1)} °C (${toKelvin(room.measuredC).toFixed(2)} K)</strong></div>
      <div class="summary-row"><span>Νέα επιθυμητή</span><strong>${state.draftTempC.toFixed(1)} °C (${toKelvin(state.draftTempC).toFixed(2)} K)</strong></div>
      <div class="summary-row"><span>Μεταβολή ισχύος ΔQ̇</span><strong>${sign}${formatWatts(Math.abs(deltaQ))}</strong></div>
      <div class="summary-row"><span>Νέα απαίτηση θέρμανσης</span><strong>${formatWatts(qNew)}</strong></div>
    `;

    el.confirmModal.classList.remove('is-hidden');
    el.modalConfirm.focus();
  }

  function closeConfirmModal() {
    el.confirmModal.classList.add('is-hidden');
  }

  el.btnApply.addEventListener('click', openConfirmModal);

  el.modalCancel.addEventListener('click', () => {
    closeConfirmModal();
    const room = getSelectedRoom();
    state.infoNotice = {
      title: 'Η αλλαγή θερμοκρασίας ακυρώθηκε',
      body: `Δεν εστάλη εντολή για τον χώρο «${room.name}». Η ρύθμιση παραμένει στους ${room.measuredC.toFixed(1)} °C (${toKelvin(room.measuredC).toFixed(2)} K).`,
    };
    renderAll();
  });

  el.confirmModal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      el.modalCancel.click();
    }
  });

  // Simulated Execution Flow (Accepted -> In Progress -> Completed)
  function runTemperatureCommand(room, targetC, previousC) {
    if (state.execTimer) clearInterval(state.execTimer);
    state.execRunning = true;
    state.infoNotice = null;
    state.lastUndo = { roomId: room.id, previousC };

    el.executionPanel.classList.remove('is-hidden');
    el.btnUndoExec.hidden = true;
    el.btnDismissExec.hidden = true;

    const startC = room.measuredC;
    let progress = 0;

    function updateProgressUI(pct, stageText, title, detail, activeStep) {
      el.execPercent.textContent = `${pct}%`;
      el.execProgressFill.style.width = `${pct}%`;
      el.execProgressbar.setAttribute('aria-valuenow', String(pct));
      el.execStageLabel.textContent = stageText;
      el.execTitle.textContent = title;
      el.execDetail.textContent = detail;

      el.stepAccepted.className = `step-pill${activeStep > 1 ? ' is-done' : activeStep === 1 ? ' is-active' : ''}`;
      el.stepRunning.className = `step-pill${activeStep > 2 ? ' is-done' : activeStep === 2 ? ' is-active' : ''}`;
      el.stepDone.className = `step-pill${activeStep === 3 ? ' is-done' : ''}`;
    }

    updateProgressUI(
      12,
      'Στάδιο 1/3 · Αποδοχή',
      `Εντολή αποδεκτή για «${room.name}»`,
      `Αποστολή στόχου ${targetC.toFixed(1)} °C (${toKelvin(targetC).toFixed(2)} K) στον ελεγκτή θέρμανσης...`,
      1
    );
    renderAll();

    state.execTimer = setInterval(() => {
      progress += 11;
      if (progress < 100) {
        const interpolated = startC + ((targetC - startC) * progress) / 100;
        room.measuredC = Math.round(interpolated * 10) / 10;
        room.trend = targetC > startC ? '↗ Θέρμανση σε εξέλιξη' : '↘ Ψύξη σε εξέλιξη';
        updateProgressUI(
          progress,
          'Στάδιο 2/3 · Σε εξέλιξη',
          `Προσαρμογή θερμοκρασίας (${room.name})`,
          `Τρέχουσα μέτρηση: ${room.measuredC.toFixed(1)} °C (${toKelvin(room.measuredC).toFixed(2)} K) → Στόχος: ${targetC.toFixed(1)} °C.`,
          2
        );
        renderAll();
      } else {
        clearInterval(state.execTimer);
        state.execTimer = null;
        state.execRunning = false;
        room.measuredC = targetC;
        room.targetC = targetC;
        room.trend = '→ Σταθερή';
        room.timestamp = 'Sol 142 · 14:24';
        state.draftTempC = targetC;

        updateProgressUI(
          100,
          'Στάδιο 3/3 · Επιτυχής Ολοκλήρωση',
          `Επιτεύχθηκε στόχος ${targetC.toFixed(1)} °C (${toKelvin(targetC).toFixed(2)} K)`,
          `Ο χώρος «${room.name}» σταθεροποιήθηκε στη νέα επιθυμητή θερμοκρασία. Νέα ισχύς απωλειών: ${formatWatts(calcHeatLossW(room, targetC))}.`,
          3
        );
        el.btnUndoExec.hidden = false;
        el.btnDismissExec.hidden = false;
        renderAll();
      }
    }, 320);
  }

  el.modalConfirm.addEventListener('click', () => {
    closeConfirmModal();
    const room = getSelectedRoom();
    runTemperatureCommand(room, state.draftTempC, room.measuredC);
  });

  el.btnUndoExec.addEventListener('click', () => {
    if (!state.lastUndo || state.execRunning) return;
    const targetRoom = rooms.find((r) => r.id === state.lastUndo.roomId);
    if (!targetRoom) return;
    state.selectedRoomId = targetRoom.id;
    state.draftTempC = state.lastUndo.previousC;
    runTemperatureCommand(targetRoom, state.lastUndo.previousC, targetRoom.measuredC);
  });

  el.btnDismissExec.addEventListener('click', () => {
    el.executionPanel.classList.add('is-hidden');
  });

  // Simulation Fault Controls
  el.simSensorLoss.addEventListener('change', (e) => {
    state.sensorLost = e.target.checked;
    state.infoNotice = null;
    renderAll();
  });

  el.simStaleOut.addEventListener('change', (e) => {
    externalSensor.stale = e.target.checked;
    renderAll();
  });

  el.simOutOfBounds.addEventListener('click', () => {
    if (state.sensorLost || state.execRunning) return;
    state.draftTempC = 32.0;
    state.infoNotice = null;
    renderAll();
  });

  // Navigation Tabs
  function switchTab(tab) {
    const isTemp = tab === 'temp';
    el.tabTemp.classList.toggle('is-active', isTemp);
    el.tabTemp.setAttribute('aria-selected', String(isTemp));
    el.panelTemp.classList.toggle('is-hidden', !isTemp);

    el.tabIrrigation.classList.toggle('is-active', !isTemp);
    el.tabIrrigation.setAttribute('aria-selected', String(!isTemp));
    el.panelIrrigation.classList.toggle('is-hidden', isTemp);

    el.activeRoleName.textContent = isTemp ? 'Υπεύθυνος Υποστήριξης Ζωής' : 'Υπεύθυνος Πόρων';
  }

  el.tabTemp.addEventListener('click', () => switchTab('temp'));
  el.tabIrrigation.addEventListener('click', () => switchTab('irrigation'));

  // =========================================================================
  // FUNCTION B: GREENHOUSE IRRIGATION SCHEDULING (SUBSYSTEM B)
  // =========================================================================

  const TANK_CAPACITY_L = 1000;
  const TANK_MIN_RESERVE_L = 200;
  const RECYCLE_EFFICIENCY = 0.70;

  const tankState = {
    currentL: 620,
    savedNormalL: 620,
    timestamp: 'Sol 142 · 14:20',
  };

  const zones = [
    {
      id: 'trees',
      code: 'GH-Z1',
      name: 'Ζώνη Α — Δέντρα',
      crops: 'Πορτοκάλια, μήλα & εσπεριδοειδή',
      moisturePct: 42.0,
      idealMin: 45,
      idealMax: 65,
      moistureGainPerL: 0.18,
      recMinL: 60,
      recMaxL: 120,
      defaultVolL: 80,
      sensorId: 'SOIL-Z1',
      timestamp: 'Sol 142 · 14:20',
      trend: '↘ −1.1% / h',
    },
    {
      id: 'roots',
      code: 'GH-Z2',
      name: 'Ζώνη Β — Καλλιέργειες Εδάφους',
      crops: 'Καρότα, πατάτες & βολβοί',
      moisturePct: 38.0,
      idealMin: 50,
      idealMax: 70,
      moistureGainPerL: 0.24,
      recMinL: 40,
      recMaxL: 100,
      defaultVolL: 65,
      sensorId: 'SOIL-Z2',
      timestamp: 'Sol 142 · 14:20',
      trend: '↘ −1.4% / h',
    },
    {
      id: 'herbs',
      code: 'GH-Z3',
      name: 'Ζώνη Γ — Βότανα',
      crops: 'Τσάι, δυόσμος & αρωματικά',
      moisturePct: 51.0,
      idealMin: 45,
      idealMax: 60,
      moistureGainPerL: 0.35,
      recMinL: 15,
      recMaxL: 45,
      defaultVolL: 30,
      sensorId: 'SOIL-Z3',
      timestamp: 'Sol 142 · 14:20',
      trend: '→ −0.5% / h',
    },
    {
      id: 'shrubs',
      code: 'GH-Z4',
      name: 'Ζώνη Δ — Θάμνοι',
      crops: 'Φράουλες, μούρα & μικροί θάμνοι',
      moisturePct: 44.0,
      idealMin: 55,
      idealMax: 75,
      moistureGainPerL: 0.28,
      recMinL: 30,
      recMaxL: 75,
      defaultVolL: 55,
      sensorId: 'SOIL-Z4',
      timestamp: 'Sol 142 · 14:20',
      trend: '↘ −1.2% / h',
    },
  ];

  const irrState = {
    selectedZoneId: zones[0].id,
    startTime: '14:35',
    volumeL: zones[0].defaultVolL,
    schedules: [],
    nextScheduleId: 1,
    activeRunId: null,
    activeTimer: null,
    valveFault: false,
    notice: null,
    modalMode: 'temp', // 'temp' | 'irrigation'
  };

  const irrEl = {
    alertBanner: document.getElementById('irr-alert-banner'),
    alertIcon: document.getElementById('irr-alert-icon'),
    alertSeverity: document.getElementById('irr-alert-severity'),
    alertTitle: document.getElementById('irr-alert-title'),
    alertCause: document.getElementById('irr-alert-cause'),
    alertImpact: document.getElementById('irr-alert-impact'),
    alertAction: document.getElementById('irr-alert-action'),
    alertRecoveryBtn: document.getElementById('irr-alert-recovery-btn'),

    zoneList: document.getElementById('zone-list'),
    selectedZoneCode: document.getElementById('selected-zone-code'),

    tankQuality: document.getElementById('tank-quality'),
    tankWaterFill: document.getElementById('tank-water-fill'),
    tankPreviewSlice: document.getElementById('tank-preview-slice'),
    tankFlowOverlay: document.getElementById('tank-flow-overlay'),
    tankVolL: document.getElementById('tank-vol-l'),
    tankVolPct: document.getElementById('tank-vol-pct'),
    tankUsableLine: document.getElementById('tank-usable-line'),
    tankTimestamp: document.getElementById('tank-timestamp'),

    zoneQuality: document.getElementById('zone-quality'),
    zoneMoistureVal: document.getElementById('zone-moisture-val'),
    zoneMoistureState: document.getElementById('zone-moisture-state'),
    moistureIdealBand: document.getElementById('moisture-ideal-band'),
    moistureBarFill: document.getElementById('moisture-bar-fill'),
    moistureBarProjected: document.getElementById('moisture-bar-projected'),
    zoneCropsDesc: document.getElementById('zone-crops-desc'),
    zoneIdealRange: document.getElementById('zone-ideal-range'),
    zoneSensorId: document.getElementById('zone-sensor-id'),
    zoneTimestamp: document.getElementById('zone-timestamp'),
    zoneTrend: document.getElementById('zone-trend'),

    irrZoneTitle: document.getElementById('irr-zone-title'),
    irrStatusTag: document.getElementById('irr-status-tag'),
    irrTimeInput: document.getElementById('irr-time-input'),
    irrRecommendedHint: document.getElementById('irr-recommended-hint'),
    irrVolumeRange: document.getElementById('irr-volume-range'),
    irrVolumeInput: document.getElementById('irr-volume-input'),

    irrDeltaBadge: document.getElementById('irr-delta-badge'),
    irrCurTank: document.getElementById('irr-cur-tank'),
    irrCurMoisture: document.getElementById('irr-cur-moisture'),
    irrNewTank: document.getElementById('irr-new-tank'),
    irrNewMoisture: document.getElementById('irr-new-moisture'),
    reserveMarginNote: document.getElementById('reserve-margin-note'),
    irrModelCalcLine: document.getElementById('irr-model-calc-line'),

    btnReset: document.getElementById('irr-btn-reset'),
    btnSchedule: document.getElementById('irr-btn-schedule'),

    scheduleCountChip: document.getElementById('schedule-count-chip'),
    scheduleList: document.getElementById('schedule-list'),

    simLowTank: document.getElementById('sim-low-tank'),
    simValveFault: document.getElementById('sim-valve-fault'),
    simRefillTank: document.getElementById('sim-refill-tank'),
  };

  function getSelectedZone() {
    return zones.find((z) => z.id === irrState.selectedZoneId) || zones[0];
  }

  function getUsableWaterL() {
    return Math.max(0, tankState.currentL - TANK_MIN_RESERVE_L);
  }

  function getProjectedMoisture(zone, volL) {
    return Math.min(100, zone.moisturePct + volL * zone.moistureGainPerL);
  }

  function isVolumeValid(volL) {
    if (!Number.isFinite(volL) || volL <= 0) return { ok: false, reason: 'invalid' };
    if (tankState.currentL - volL < TANK_MIN_RESERVE_L) return { ok: false, reason: 'reserve' };
    return { ok: true, reason: null };
  }

  function getMoistureStatusLabel(zone) {
    if (zone.moisturePct < zone.idealMin) return { text: 'Χαμηλή', dot: 'status-dot is-warn' };
    if (zone.moisturePct > zone.idealMax) return { text: 'Υψηλή', dot: 'status-dot is-warn' };
    return { text: 'Ιδανική', dot: 'status-dot' };
  }

  function renderZoneList() {
    irrEl.zoneList.innerHTML = '';
    zones.forEach((zone) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `room-item${zone.id === irrState.selectedZoneId ? ' is-selected' : ''}`;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', String(zone.id === irrState.selectedZoneId));

      const status = getMoistureStatusLabel(zone);
      btn.innerHTML = `
        <div class="room-item-top">
          <span class="room-name">${zone.name}</span>
          <span class="${status.dot}" aria-hidden="true"></span>
        </div>
        <div class="room-temp-pair">
          <strong>${zone.moisturePct.toFixed(1)}%</strong>
          <span>${zone.crops.split(',')[0]}</span>
        </div>
      `;

      btn.addEventListener('click', () => {
        irrState.selectedZoneId = zone.id;
        irrState.volumeL = zone.defaultVolL;
        irrState.notice = null;
        renderIrrigation();
      });

      irrEl.zoneList.appendChild(btn);
    });
  }

  function renderTankAndZone(zone) {
    irrEl.selectedZoneCode.textContent = zone.code;

    const currentPct = (tankState.currentL / TANK_CAPACITY_L) * 100;
    const usableL = getUsableWaterL();
    const check = isVolumeValid(irrState.volumeL);

    irrEl.tankWaterFill.style.height = `${Math.max(0, Math.min(100, currentPct))}%`;
    irrEl.tankWaterFill.classList.toggle('is-danger', !check.ok && check.reason === 'reserve');

    // Preview consumption slice inside current water column
    const previewFraction = tankState.currentL > 0 ? Math.min(1, Math.max(0, irrState.volumeL / tankState.currentL)) : 0;
    irrEl.tankPreviewSlice.style.height = irrState.activeRunId ? '0%' : `${(previewFraction * 100).toFixed(1)}%`;
    irrEl.tankFlowOverlay.classList.toggle('is-hidden', irrState.activeRunId === null);

    irrEl.tankVolL.textContent = `${Math.round(tankState.currentL)} L`;
    irrEl.tankVolPct.textContent = `${currentPct.toFixed(1)}% · ${(tankState.currentL / 1000).toFixed(2)} m³`;
    irrEl.tankUsableLine.textContent = `Αξιοποιήσιμο: ${Math.round(usableL)} L`;
    irrEl.tankUsableLine.classList.toggle('is-danger', usableL < 50 || (!check.ok && check.reason === 'reserve'));
    irrEl.tankTimestamp.textContent = tankState.timestamp;

    if (usableL <= 50) {
      irrEl.tankQuality.className = 'quality-badge quality-warn';
      irrEl.tankQuality.innerHTML = '<span class="q-symbol" aria-hidden="true">▲</span> Χαμηλή στάθμη';
    } else {
      irrEl.tankQuality.className = 'quality-badge quality-ok';
      irrEl.tankQuality.innerHTML = '<span class="q-symbol" aria-hidden="true">●</span> Αξιόπιστη';
    }

    // Zone moisture card
    const mStatus = getMoistureStatusLabel(zone);
    const projectedM = getProjectedMoisture(zone, irrState.volumeL);

    irrEl.zoneMoistureVal.textContent = `${zone.moisturePct.toFixed(1)}%`;
    irrEl.zoneMoistureState.textContent = mStatus.text;
    irrEl.zoneCropsDesc.textContent = zone.crops;
    irrEl.zoneIdealRange.textContent = `Ιδανικό εύρος: ${zone.idealMin}%–${zone.idealMax}%`;
    irrEl.zoneSensorId.textContent = zone.sensorId;
    irrEl.zoneTimestamp.textContent = zone.timestamp;
    irrEl.zoneTrend.textContent = zone.trend;

    irrEl.moistureIdealBand.style.left = `${zone.idealMin}%`;
    irrEl.moistureIdealBand.style.width = `${zone.idealMax - zone.idealMin}%`;
    irrEl.moistureBarFill.style.width = `${Math.min(100, zone.moisturePct)}%`;

    const gainWidth = Math.max(0, projectedM - zone.moisturePct);
    irrEl.moistureBarProjected.style.left = `${Math.min(100, zone.moisturePct)}%`;
    irrEl.moistureBarProjected.style.width = `${Math.min(100 - zone.moisturePct, gainWidth)}%`;
  }

  function renderIrrigationFormAndPreview(zone) {
    const check = isVolumeValid(irrState.volumeL);
    const usableL = getUsableWaterL();
    const afterTankL = Math.max(0, tankState.currentL - irrState.volumeL);
    const marginAfterL = tankState.currentL - irrState.volumeL - TANK_MIN_RESERVE_L;
    const projectedM = getProjectedMoisture(zone, irrState.volumeL);

    irrEl.irrZoneTitle.textContent = zone.name;
    irrEl.irrRecommendedHint.textContent = `Συνιστώμενη δόση: ${zone.recMinL}–${zone.recMaxL} L`;
    irrEl.irrTimeInput.value = irrState.startTime;
    irrEl.irrVolumeRange.value = String(Math.min(500, Math.max(10, irrState.volumeL)));
    irrEl.irrVolumeInput.value = String(irrState.volumeL);

    // Highlight active preset chips
    document.querySelectorAll('#panel-irrigation .chip-btn[data-time]').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.time === irrState.startTime);
    });
    document.querySelectorAll('#panel-irrigation .chip-btn[data-vol]').forEach((b) => {
      b.classList.toggle('is-active', Number(b.dataset.vol) === irrState.volumeL);
    });

    if (!check.ok && check.reason === 'reserve') {
      irrEl.irrStatusTag.textContent = 'Ανεπαρκές απόθεμα';
      irrEl.irrStatusTag.className = 'status-tag is-danger';
    } else if (!check.ok) {
      irrEl.irrStatusTag.textContent = 'Μη έγκυρη ποσότητα';
      irrEl.irrStatusTag.className = 'status-tag is-danger';
    } else {
      irrEl.irrStatusTag.textContent = 'Επαρκές απόθεμα';
      irrEl.irrStatusTag.className = 'status-tag';
    }

    const dropPct = (irrState.volumeL / TANK_CAPACITY_L) * 100;
    irrEl.irrDeltaBadge.textContent = `−${irrState.volumeL} L (−${dropPct.toFixed(1)}%)`;
    irrEl.irrDeltaBadge.className = `delta-badge ${check.ok ? 'increase' : 'neutral'}`;

    irrEl.irrCurTank.textContent = `${Math.round(tankState.currentL)} L`;
    irrEl.irrCurMoisture.textContent = `Υγρασία: ${zone.moisturePct.toFixed(1)}%`;
    irrEl.irrNewTank.textContent = `${Math.round(afterTankL)} L`;
    irrEl.irrNewMoisture.textContent = `Εκτ. υγρασία: ${projectedM.toFixed(1)}%`;

    if (marginAfterL < 0) {
      irrEl.reserveMarginNote.className = 'reserve-margin-bar is-danger';
      irrEl.reserveMarginNote.innerHTML = `Παραβίαση ελάχιστης εφεδρείας (200 L) κατά <strong>${Math.abs(Math.round(marginAfterL))} L</strong>. Μέγιστη επιτρεπτή δόση: <strong>${Math.round(usableL)} L</strong>.`;
    } else {
      irrEl.reserveMarginNote.className = 'reserve-margin-bar';
      irrEl.reserveMarginNote.innerHTML = `Περιθώριο πάνω από ελάχιστη εφεδρεία (200 L): <strong>${Math.round(marginAfterL)} L</strong>`;
    }

    const futureRecycled = Math.round(irrState.volumeL * RECYCLE_EFFICIENCY);
    const netLoss = Math.round(irrState.volumeL * (1 - RECYCLE_EFFICIENCY));
    irrEl.irrModelCalcLine.textContent =
      `Υπολογισμός: Vνέο = ${Math.round(tankState.currentL)} − ${irrState.volumeL} = ${Math.round(tankState.currentL - irrState.volumeL)} L (Όριο ≥ 200 L). Μελλοντική ανάκτηση κύκλου: ~${futureRecycled} L, καθαρή απώλεια: ~${netLoss} L.`;

    irrEl.btnSchedule.disabled = !check.ok || !irrState.startTime || irrState.activeRunId !== null;
  }

  function renderIrrigationAlert(zone) {
    const check = isVolumeValid(irrState.volumeL);
    const usableL = getUsableWaterL();
    irrEl.alertRecoveryBtn.hidden = true;
    irrEl.alertRecoveryBtn.onclick = null;

    if (!check.ok && check.reason === 'reserve') {
      irrEl.alertBanner.className = 'alert-banner';
      irrEl.alertIcon.textContent = '✕';
      irrEl.alertSeverity.textContent = 'ΑΝΕΠΑΡΚΕΣ ΝΕΡΟ';
      irrEl.alertTitle.textContent = `Η ποσότητα των ${irrState.volumeL} L παραβιάζει την ελάχιστη εφεδρεία δεξαμενής`;
      irrEl.alertCause.textContent = `Αιτία: Τρέχον απόθεμα ${Math.round(tankState.currentL)} L με υποχρεωτική εφεδρεία ${TANK_MIN_RESERVE_L} L (αξιοποιήσιμο: ${Math.round(usableL)} L).`;
      irrEl.alertImpact.textContent = 'Επίπτωση: Κίνδυνος εξάντλησης αποθέματος νερού υποστήριξης ζωής. Η αποθήκευση προγράμματος έχει μπλοκαριστεί.';
      irrEl.alertAction.textContent = usableL >= 10
        ? `Προτεινόμενη ενέργεια: Μειώστε την ποσότητα έως ${Math.round(usableL)} L ή αναπληρώστε τη δεξαμενή.`
        : 'Προτεινόμενη ενέργεια: Δεν υπάρχει επαρκές αξιοποιήσιμο νερό. Αναπληρώστε τη δεξαμενή πριν από νέο πρόγραμμα.';
      if (usableL >= 10) {
        irrEl.alertRecoveryBtn.hidden = false;
        irrEl.alertRecoveryBtn.textContent = `Προσαρμογή σε ${Math.floor(usableL / 5) * 5} L`;
        irrEl.alertRecoveryBtn.onclick = () => {
          irrState.volumeL = Math.max(5, Math.floor(usableL / 5) * 5);
          renderIrrigation();
        };
      }
      return;
    }

    if (!check.ok && check.reason === 'invalid') {
      irrEl.alertBanner.className = 'alert-banner';
      irrEl.alertIcon.textContent = '!';
      irrEl.alertSeverity.textContent = 'ΜΗ ΕΓΚΥΡΗ ΤΙΜΗ';
      irrEl.alertTitle.textContent = 'Μη έγκυρη ποσότητα άρδευσης';
      irrEl.alertCause.textContent = 'Αιτία: Η ποσότητα άρδευσης πρέπει να είναι θετικός αριθμός μεγαλύτερος από 0 L.';
      irrEl.alertImpact.textContent = 'Επίπτωση: Αδύνατη η εκτίμηση κατανάλωσης.';
      irrEl.alertAction.textContent = `Προτεινόμενη ενέργεια: Επιλέξτε ποσότητα εντός της συνιστώμενης δόσης (${zone.recMinL}–${zone.recMaxL} L).`;
      return;
    }

    if (irrState.notice) {
      const isErr = irrState.notice.type === 'error';
      irrEl.alertBanner.className = isErr ? 'alert-banner' : 'alert-banner is-info';
      irrEl.alertIcon.textContent = isErr ? '✕' : 'i';
      irrEl.alertSeverity.textContent = isErr ? 'ΑΠΟΤΥΧΙΑ ΕΚΤΕΛΕΣΗΣ' : 'ΕΝΗΜΕΡΩΣΗ';
      irrEl.alertTitle.textContent = irrState.notice.title;
      irrEl.alertCause.textContent = irrState.notice.cause;
      irrEl.alertImpact.textContent = irrState.notice.impact || '';
      irrEl.alertAction.textContent = irrState.notice.action || '';
      irrEl.alertRecoveryBtn.hidden = false;
      irrEl.alertRecoveryBtn.textContent = 'Κλείσιμο';
      irrEl.alertRecoveryBtn.onclick = () => {
        irrState.notice = null;
        renderIrrigation();
      };
      return;
    }

    irrEl.alertBanner.className = 'alert-banner is-hidden';
  }

  function renderSchedules() {
    const count = irrState.schedules.length;
    irrEl.scheduleCountChip.textContent = `${count} ${count === 1 ? 'πρόγραμμα' : 'προγράμματα'}`;

    if (count === 0) {
      irrEl.scheduleList.innerHTML =
        '<div class="schedule-empty">Δεν υπάρχουν ακόμη αποθηκευμένα προγράμματα άρδευσης. Ορίστε ώρα και ποσότητα παραπάνω για να αποθηκεύσετε ένα πρόγραμμα.</div>';
      return;
    }

    irrEl.scheduleList.innerHTML = '';
    irrState.schedules.forEach((sch) => {
      const card = document.createElement('div');
      card.className = `schedule-item${sch.status === 'running' ? ' is-running' : ''}${sch.status === 'failed' ? ' is-failed' : ''}`;

      const badgeMap = {
        scheduled: { cls: 'state-scheduled', text: 'Προγραμματισμένο' },
        running: { cls: 'state-running', text: `Εκτελείται (${sch.progress}%)` },
        completed: { cls: 'state-completed', text: 'Ολοκληρώθηκε' },
        failed: { cls: 'state-failed', text: 'Απέτυχε' },
      };
      const badge = badgeMap[sch.status] || badgeMap.scheduled;

      const progressBarHtml =
        sch.status === 'running' || sch.status === 'completed'
          ? `<div class="progress-track"><div class="progress-fill" style="width:${sch.progress}%"></div></div>`
          : '';

      card.innerHTML = `
        <div class="schedule-item-top">
          <span class="schedule-title">${sch.zoneName} · ${sch.volumeL} L</span>
          <span class="schedule-state-badge ${badge.cls}">${badge.text}</span>
        </div>
        <div class="schedule-meta">Ώρα έναρξης: Sol ${sch.startTime} · ${sch.detail}</div>
        ${progressBarHtml}
        <div class="schedule-actions"></div>
      `;

      const actionsEl = card.querySelector('.schedule-actions');

      if (sch.status === 'scheduled' || sch.status === 'failed') {
        const runBtn = document.createElement('button');
        runBtn.type = 'button';
        runBtn.className = 'btn btn-primary btn-xs';
        runBtn.textContent = sch.status === 'failed' ? 'Επανάληψη Εκτέλεσης' : '▶ Προσομοίωση Εκτέλεσης';
        runBtn.disabled = irrState.activeRunId !== null;
        runBtn.addEventListener('click', () => runIrrigationSimulation(sch.id));
        actionsEl.appendChild(runBtn);

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn btn-ghost btn-xs';
        delBtn.textContent = 'Ακύρωση';
        delBtn.disabled = irrState.activeRunId !== null;
        delBtn.addEventListener('click', () => {
          irrState.schedules = irrState.schedules.filter((s) => s.id !== sch.id);
          renderIrrigation();
        });
        actionsEl.appendChild(delBtn);
      }

      irrEl.scheduleList.appendChild(card);
    });
  }

  function renderIrrigation() {
    const zone = getSelectedZone();
    renderZoneList();
    renderTankAndZone(zone);
    renderIrrigationFormAndPreview(zone);
    renderIrrigationAlert(zone);
    renderSchedules();
  }

  function runIrrigationSimulation(scheduleId) {
    const sch = irrState.schedules.find((s) => s.id === scheduleId);
    if (!sch || irrState.activeRunId !== null) return;

    const zone = zones.find((z) => z.id === sch.zoneId);
    if (!zone) return;

    // Re-check water availability at execution time
    if (tankState.currentL - sch.volumeL < TANK_MIN_RESERVE_L) {
      sch.status = 'failed';
      sch.detail = `Αποτυχία έναρξης: ανεπαρκές απόθεμα (${Math.round(tankState.currentL)} L < ${sch.volumeL + TANK_MIN_RESERVE_L} L απαιτούμενα με εφεδρεία).`;
      irrState.notice = {
        type: 'error',
        title: `Αποτυχία εκτέλεσης άρδευσης (${sch.zoneName})`,
        cause: `Αιτία: Το τρέχον απόθεμα δεξαμενής (${Math.round(tankState.currentL)} L) δεν επαρκεί χωρίς παραβίαση της ελάχιστης εφεδρείας (${TANK_MIN_RESERVE_L} L).`,
        impact: 'Επίπτωση: Η βαλβίδα παρέμεινε κλειστή και δεν καταναλώθηκε νερό.',
        action: 'Προτεινόμενη ενέργεια: Αναπληρώστε τη δεξαμενή ή δημιουργήστε νέο πρόγραμμα με μικρότερη ποσότητα.',
      };
      renderIrrigation();
      return;
    }

    irrState.selectedZoneId = zone.id;
    irrState.activeRunId = sch.id;
    irrState.notice = null;
    sch.status = 'running';
    sch.progress = 0;

    const totalSteps = 10;
    const volPerStep = sch.volumeL / totalSteps;
    const moisturePerStep = volPerStep * zone.moistureGainPerL;
    let step = 0;

    sch.detail = 'Άνοιγμα βαλβίδας & έναρξη ροής νερού...';
    renderIrrigation();

    irrState.activeTimer = setInterval(() => {
      step += 1;

      // Simulated valve fault mid-way
      if (irrState.valveFault && step === 4) {
        clearInterval(irrState.activeTimer);
        irrState.activeTimer = null;
        irrState.activeRunId = null;
        sch.status = 'failed';
        const dispensed = Math.round(volPerStep * (step - 1));
        sch.detail = `Διακοπή στο ${sch.progress}% (${dispensed} L) λόγω σφάλματος βαλβίδας ${zone.code}.`;
        irrState.notice = {
          type: 'error',
          title: `Αποτυχία βαλβίδας κατά την άρδευση (${zone.name})`,
          cause: `Αιτία: Ανιχνεύθηκε απώλεια πίεσης / εμπλοκή βαλβίδας στον κλάδο ${zone.code} μετά την παροχή ${dispensed} L.`,
          impact: 'Επίπτωση: Η ροή διακόπηκε αυτόματα για αποτροπή διαρροής. Η στάθμη δεξαμενής ενημερώθηκε με την πραγματική παροχή.',
          action: 'Προτεινόμενη ενέργεια: Ελέγξτε τη βαλβίδα (απενεργοποιήστε το σφάλμα προσομοίωσης) και επαναλάβετε το πρόγραμμα.',
        };
        renderIrrigation();
        return;
      }

      tankState.currentL = Math.max(TANK_MIN_RESERVE_L, tankState.currentL - volPerStep);
      zone.moisturePct = Math.min(100, zone.moisturePct + moisturePerStep);
      sch.progress = Math.round((step / totalSteps) * 100);
      const deliveredL = Math.round(step * volPerStep);
      sch.detail = `Παροχή σε εξέλιξη: ${deliveredL} / ${sch.volumeL} L · Υγρασία ζώνης: ${zone.moisturePct.toFixed(1)}%`;

      if (step >= totalSteps) {
        clearInterval(irrState.activeTimer);
        irrState.activeTimer = null;
        irrState.activeRunId = null;
        sch.status = 'completed';
        sch.progress = 100;
        tankState.timestamp = 'Sol 142 · 14:38';
        zone.timestamp = 'Sol 142 · 14:38';
        zone.trend = '↗ Πρόσφατη άρδευση';
        sch.detail = `Ολοκληρώθηκε παροχή ${sch.volumeL} L · Νέα στάθμη δεξαμενής: ${Math.round(tankState.currentL)} L · Υγρασία: ${zone.moisturePct.toFixed(1)}%`;
        irrState.notice = {
          type: 'info',
          title: `Ολοκληρώθηκε η άρδευση στη «${zone.name}»`,
          cause: `Διοχετεύθηκαν ${sch.volumeL} L νερού. Η στάθμη της δεξαμενής ενημερώθηκε στα ${Math.round(tankState.currentL)} L και η υγρασία υποστρώματος ανήλθε σε ${zone.moisturePct.toFixed(1)}%.`,
        };
      }

      renderIrrigation();
    }, 340);
  }

  // Irrigation Event Listeners
  irrEl.irrTimeInput.addEventListener('change', () => {
    irrState.startTime = irrEl.irrTimeInput.value;
    renderIrrigation();
  });

  document.querySelectorAll('#panel-irrigation .chip-btn[data-time]').forEach((btn) => {
    btn.addEventListener('click', () => {
      irrState.startTime = btn.dataset.time;
      renderIrrigation();
    });
  });

  document.querySelectorAll('#panel-irrigation .chip-btn[data-vol]').forEach((btn) => {
    btn.addEventListener('click', () => {
      irrState.volumeL = Number(btn.dataset.vol);
      irrState.notice = null;
      renderIrrigation();
    });
  });

  irrEl.irrVolumeRange.addEventListener('input', () => {
    irrState.volumeL = Number(irrEl.irrVolumeRange.value);
    irrState.notice = null;
    renderIrrigation();
  });

  irrEl.irrVolumeInput.addEventListener('input', () => {
    const val = parseFloat(irrEl.irrVolumeInput.value);
    if (!Number.isFinite(val)) return;
    irrState.volumeL = val;
    irrState.notice = null;
    renderIrrigation();
  });

  irrEl.btnReset.addEventListener('click', () => {
    const zone = getSelectedZone();
    irrState.volumeL = zone.defaultVolL;
    irrState.startTime = '14:35';
    irrState.notice = null;
    renderIrrigation();
  });

  // Reuse confirmation modal cleanly for both Function A and Function B
  const modalTitleEl = document.getElementById('modal-title');
  const modalWarningEl = document.querySelector('.modal-warning');

  const origOpenConfirmModal = openConfirmModal;
  el.btnApply.removeEventListener('click', origOpenConfirmModal);
  el.btnApply.addEventListener('click', () => {
    irrState.modalMode = 'temp';
    modalTitleEl.textContent = 'Μεταβολή επιθυμητής θερμοκρασίας';
    modalWarningEl.textContent =
      'Η μεταβολή της θερμικής ρύθμισης επηρεάζει άμεσα τη ζήτηση ηλεκτρικής ισχύος του συστήματος υποστήριξης ζωής. Βεβαιωθείτε ότι η εκτιμώμενη επίπτωση είναι αποδεκτή πριν από την εκτέλεση.';
    origOpenConfirmModal();
  });

  irrEl.btnSchedule.addEventListener('click', () => {
    const zone = getSelectedZone();
    const afterL = tankState.currentL - irrState.volumeL;
    const projectedM = getProjectedMoisture(zone, irrState.volumeL);

    irrState.modalMode = 'irrigation';
    modalTitleEl.textContent = 'Επιβεβαίωση προγράμματος άρδευσης';
    modalWarningEl.textContent =
      'Η αποθήκευση του προγράμματος δεσμεύει την επιλεγμένη ποσότητα νερού. Κατά την εκτέλεση θα γίνει εκ νέου έλεγχος επάρκειας έναντι της ελάχιστης εφεδρείας (200 L).';

    el.modalSummary.innerHTML = `
      <div class="summary-row"><span>Ζώνη θερμοκηπίου</span><strong>${zone.name} (${zone.code})</strong></div>
      <div class="summary-row"><span>Ώρα έναρξης</span><strong>Sol ${irrState.startTime}</strong></div>
      <div class="summary-row"><span>Ποσότητα άρδευσης</span><strong>${irrState.volumeL} L</strong></div>
      <div class="summary-row"><span>Στάθμη δεξαμενής</span><strong>${Math.round(tankState.currentL)} L → ${Math.round(afterL)} L</strong></div>
      <div class="summary-row"><span>Εκτιμώμενη υγρασία</span><strong>${zone.moisturePct.toFixed(1)}% → ${projectedM.toFixed(1)}%</strong></div>
    `;

    el.confirmModal.classList.remove('is-hidden');
    el.modalConfirm.focus();
  });

  // Override modal confirm & cancel to handle both modes cleanly
  const newConfirmBtn = el.modalConfirm.cloneNode(true);
  el.modalConfirm.parentNode.replaceChild(newConfirmBtn, el.modalConfirm);
  el.modalConfirm = newConfirmBtn;

  const newCancelBtn = el.modalCancel.cloneNode(true);
  el.modalCancel.parentNode.replaceChild(newCancelBtn, el.modalCancel);
  el.modalCancel = newCancelBtn;

  el.modalConfirm.addEventListener('click', () => {
    closeConfirmModal();
    if (irrState.modalMode === 'temp') {
      const room = getSelectedRoom();
      runTemperatureCommand(room, state.draftTempC, room.measuredC);
    } else {
      const zone = getSelectedZone();
      irrState.schedules.unshift({
        id: irrState.nextScheduleId++,
        zoneId: zone.id,
        zoneName: zone.name,
        startTime: irrState.startTime,
        volumeL: irrState.volumeL,
        status: 'scheduled',
        progress: 0,
        detail: 'Αποθηκευμένο · Έτοιμο για προσομοιωμένη εκτέλεση.',
      });
      irrState.notice = {
        type: 'info',
        title: `Αποθηκεύτηκε το πρόγραμμα άρδευσης (${zone.name})`,
        cause: `Προγραμματίστηκε παροχή ${irrState.volumeL} L στις Sol ${irrState.startTime}. Πατήστε «▶ Προσομοίωση Εκτέλεσης» στη λίστα για live προβολή της άρδευσης.`,
      };
      renderIrrigation();
    }
  });

  el.modalCancel.addEventListener('click', () => {
    closeConfirmModal();
    if (irrState.modalMode === 'temp') {
      const room = getSelectedRoom();
      state.infoNotice = {
        title: 'Η αλλαγή θερμοκρασίας ακυρώθηκε',
        body: `Δεν εστάλη εντολή για τον χώρο «${room.name}». Η ρύθμιση παραμένει στους ${room.measuredC.toFixed(1)} °C (${toKelvin(room.measuredC).toFixed(2)} K).`,
      };
      renderAll();
    } else {
      const zone = getSelectedZone();
      irrState.notice = {
        type: 'info',
        title: 'Ο προγραμματισμός άρδευσης ακυρώθηκε',
        cause: `Δεν αποθηκεύτηκε πρόγραμμα για τη ζώνη «${zone.name}». Το απόθεμα παραμένει στα ${Math.round(tankState.currentL)} L.`,
      };
      renderIrrigation();
    }
  });

  // Simulation Fault Controls for Function B
  irrEl.simLowTank.addEventListener('change', (e) => {
    if (irrState.activeRunId !== null) {
      e.target.checked = !e.target.checked;
      return;
    }
    if (e.target.checked) {
      tankState.savedNormalL = tankState.currentL;
      tankState.currentL = 230;
    } else {
      tankState.currentL = Math.max(260, tankState.savedNormalL);
    }
    irrState.notice = null;
    renderIrrigation();
  });

  irrEl.simValveFault.addEventListener('change', (e) => {
    irrState.valveFault = e.target.checked;
  });

  irrEl.simRefillTank.addEventListener('click', () => {
    if (irrState.activeRunId !== null) return;
    tankState.currentL = 620;
    tankState.savedNormalL = 620;
    irrEl.simLowTank.checked = false;
    irrState.notice = {
      type: 'info',
      title: 'Η δεξαμενή νερού αναπληρώθηκε',
      cause: 'Η στάθμη της δεξαμενής TANK-W1 επανήλθε στα 620 L (62.0%, διαθέσιμο 420 L).',
    };
    renderIrrigation();
  });

  // Initial Render
  renderAll();
  renderIrrigation();
})();
