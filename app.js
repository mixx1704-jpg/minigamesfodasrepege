(function () {
  "use strict";

  var screen = document.getElementById("screen");
  var modalRoot = document.getElementById("modal-root");
  var toastEl = document.getElementById("toast");
  var audioContext = null;
  var toastTimer = null;
  var raf = 0;
  var current = null;

  var WAITER_ITEMS = [
    "Café coado", "Cappuccino", "Chá preto", "Água", "Bolo de chocolate",
    "Sanduíche", "Café com leite", "Cheesecake", "Espresso duplo"
  ];

  var STOCK_CATEGORIES = [
    { id: "cafe", name: "Café e grãos", description: "Grãos, filtros e chás" },
    { id: "louca", name: "Louças", description: "Xícaras, pratos e copos" },
    { id: "frios", name: "Geladeira", description: "Leite, creme e sobremesas" },
    { id: "limpeza", name: "Limpeza", description: "Panos, sabão e detergente" }
  ];

  var STOCK_NAMES = {
    cafe: ["Saco de grãos", "Filtros de papel", "Pacotes de chá"],
    louca: ["Caixa de xícaras", "Pilha de pratos", "Copos novos"],
    frios: ["Leite", "Creme fresco", "Sobremesas"],
    limpeza: ["Detergente", "Panos limpos", "Sabão"]
  };

  var WAITER_EVENTS = [
    { title: "Bandeja inclinando", text: "Um cliente esbarrou em você.", action: "A", label: "Equilibrar" },
    { title: "Cadeira no caminho", text: "Você precisa mudar a passada.", action: "D", label: "Desviar" },
    { title: "Xícara escorregando", text: "Segure antes que ela caia.", action: "W", label: "Segurar" },
    { title: "Pedido trocado", text: "Confira a comanda no último segundo.", action: "S", label: "Conferir" }
  ];

  var STOCK_EVENTS = [
    { title: "Caixa caindo", text: "Intercepte antes que atinja o chão." },
    { title: "Garrafa escorregando", text: "Não deixe o vidro quebrar." },
    { title: "Prateleira balançando", text: "Acerte o ponto de apoio." }
  ];

  var prefs = loadPrefs();
  applyPrefs();
  renderLobby();

  function loadPrefs() {
    var fallback = {
      theme: "dark",
      sound: true,
      waiter: { agility: 3, precision: 3, duration: 90 },
      stock: { strength: 3, vigor: 3, agility: 3, precision: 3, duration: 90 }
    };
    try {
      var saved = JSON.parse(localStorage.getItem("anteiku-minigames-v4") || "null");
      if (!saved) return fallback;
      return {
        theme: saved.theme === "light" ? "light" : "dark",
        sound: saved.sound !== false,
        waiter: Object.assign({}, fallback.waiter, saved.waiter || {}),
        stock: Object.assign({}, fallback.stock, saved.stock || {})
      };
    } catch {
      return fallback;
    }
  }

  function savePrefs() {
    try { localStorage.setItem("anteiku-minigames-v4", JSON.stringify(prefs)); } catch {}
  }

  function applyPrefs() {
    document.documentElement.dataset.theme = prefs.theme;
    var themeIcon = document.querySelector("[data-theme-icon]");
    var soundIcon = document.querySelector("[data-sound-icon]");
    if (themeIcon) themeIcon.textContent = prefs.theme === "dark" ? "☾" : "☀";
    if (soundIcon) soundIcon.textContent = prefs.sound ? "SOM" : "MUDO";
  }

  function bestScore(game) {
    try { return Number(localStorage.getItem("anteiku-best-" + game) || 0) || 0; } catch { return 0; }
  }

  function storeBest(game, score) {
    var clean = Math.max(0, Math.floor(score));
    if (clean > bestScore(game)) {
      try { localStorage.setItem("anteiku-best-" + game, String(clean)); } catch {}
      return true;
    }
    return false;
  }

  function renderLobby() {
    cleanupGame();
    setNav(null);
    screen.innerHTML = [
      '<section class="lobby-hero">',
        '<div>',
          '<p class="eyebrow">Central de turnos</p>',
          '<h1>Trabalhe.<br><span>Não derrube.</span></h1>',
        '</div>',
        '<div class="hero-note">',
          '<p>Dois desafios rápidos para transformar os atributos do personagem em desempenho real. <b>Escolha um turno, ajuste a ficha e tente sobreviver à correria da Anteiku.</b></p>',
        '</div>',
      '</section>',
      '<section class="game-picker" aria-label="Escolha um minigame">',
        gameCard("waiter", "01", "Agilidade + Precisão", "Turno de Garçom", "Organize comandas, entregue na mesa correta e reaja aos imprevistos sem perder o combo."),
        gameCard("stock", "02", "Força + Vigor + Reação", "Reposição de Estoque", "Carregue caixas, administre a stamina e coloque cada item na prateleira certa."),
      '</section>'
    ].join("");
    screen.focus({ preventScroll: true });
  }

  function gameCard(game, number, kicker, title, description) {
    return [
      '<button class="game-card" type="button" data-view="', game, '" data-number="', number, '">',
        '<span class="card-kicker"><span>', kicker, '</span><i aria-hidden="true"></i></span>',
        '<span><h2>', title, '</h2><p>', description, '</p></span>',
        '<span class="card-footer">',
          '<span class="best-label">Recorde local<b>', formatScore(bestScore(game)), ' pts</b></span>',
          '<span class="enter-label">ABRIR TURNO →</span>',
        '</span>',
      '</button>'
    ].join("");
  }

  function openGame(game) {
    cleanupGame();
    var saved = prefs[game];
    current = {
      game: game,
      attrs: Object.assign({}, saved),
      duration: Number(saved.duration),
      running: false,
      paused: false,
      autoPaused: false,
      score: 0,
      combo: 1,
      maxCombo: 1,
      completed: 0,
      mistakes: 0,
      level: 1,
      selected: null,
      queue: [],
      nextId: 1,
      logs: [],
      qte: null,
      nextSpawnAt: 0,
      nextEventAt: 0,
      timeLeft: Number(saved.duration),
      startedAt: 0,
      lastFrame: 0,
      lastPaint: 0,
      boardDirty: false,
      stamina: 0,
      maxStamina: 0
    };
    if (game === "stock") {
      current.maxStamina = stockMaxStamina();
      current.stamina = current.maxStamina;
    }
    setNav(game);
    renderGame();
    screen.focus({ preventScroll: true });
  }

  function renderGame() {
    if (!current) return;
    var waiter = current.game === "waiter";
    var desc = waiter
      ? "Leia a comanda, selecione o pedido e entregue na mesa indicada antes que a paciência acabe."
      : "Selecione uma caixa e guarde-a na categoria correta sem esgotar sua stamina.";
    screen.innerHTML = [
      '<header class="game-heading">',
        '<div><p class="eyebrow">Anteiku · Minigame ', waiter ? "01" : "02", '</p><h1>', waiter ? 'Turno de <span>Garçom</span>' : 'Reposição de <span>Estoque</span>', '</h1><p>', desc, '</p></div>',
        '<button class="btn" type="button" data-action="go-lobby">← Central</button>',
      '</header>',
      '<div class="game-layout">',
        renderSetupPanel(),
        '<section class="surface game-panel" aria-label="Área de jogo">',
          '<div class="hud">',
            hudCell("Tempo", "hud-time", formatTime(current.timeLeft), "accent"),
            hudCell("Pontos", "hud-score", "0"),
            hudCell("Combo", "hud-combo", "x1"),
            hudCell(waiter ? "Entregues" : "Repostos", "hud-done", "0"),
            hudCell("Erros", "hud-errors", "0"),
            hudCell(waiter ? "Pressão" : "Ritmo", "hud-level", "1"),
          '</div>',
          '<div class="timer-track"><i id="round-track"></i></div>',
          '<div id="board" class="board"></div>',
        '</section>',
      '</div>'
    ].join("");
    renderBoard();
    syncSetupMetrics();
    updateHUD();
  }

  function renderSetupPanel() {
    var waiter = current.game === "waiter";
    var disabled = current.running ? " disabled" : "";
    var fields = waiter
      ? attrField("agility", "Agilidade", "Mais tempo para pedidos e reações.", disabled) + attrField("precision", "Precisão", "Erros custam menos pontos.", disabled)
      : attrField("strength", "Força", "Reduz o custo de caixas pesadas.", disabled) + attrField("vigor", "Vigor", "Aumenta a stamina e a recuperação.", disabled) + attrField("agility", "Agilidade", "Amplia o tempo dos imprevistos.", disabled) + attrField("precision", "Precisão", "Aumenta o tamanho do alvo.", disabled);
    var mainLabel = current.running ? (current.paused ? "Continuar" : "Pausar") : "Iniciar turno";
    var secondary = current.running ? "Encerrar" : "Limpar";
    return [
      '<aside class="surface setup-panel">',
        '<div class="panel-title"><h2>Ficha do turno</h2><small>0—12</small></div>',
        '<div class="setup-body">',
          '<div class="setup-controls">', fields,
            '<label class="select-label" for="duration">Duração</label>',
            '<select id="duration" data-duration', disabled, '>',
              durationOption(60, "60 segundos"), durationOption(90, "90 segundos"), durationOption(120, "120 segundos"), durationOption(0, "Treino infinito"),
            '</select>',
          '</div>',
          '<div class="impact-grid" id="impact-grid"></div>',
          '<div class="primary-actions">',
            '<button class="btn primary" type="button" data-action="primary-game">', mainLabel, '</button>',
            '<button class="btn danger" type="button" data-action="secondary-game">', secondary, '</button>',
          '</div>',
          '<p class="tip">', waiter ? "Toque em uma comanda e depois na mesa. No teclado, os imprevistos usam W, A, S e D." : "Toque em uma caixa e depois na prateleira. Em um imprevisto, acerte o alvo vermelho antes do tempo acabar.", '</p>',
        '</div>',
      '</aside>'
    ].join("");
  }

  function attrField(key, label, help, disabled) {
    return [
      '<div class="field">',
        '<label class="field-label" for="attr-', key, '"><span>', label, '</span><output id="out-', key, '">', current.attrs[key], '</output></label>',
        '<input id="attr-', key, '" data-attr="', key, '" type="range" min="0" max="12" step="1" value="', current.attrs[key], '"', disabled, '>',
        '<p class="field-help">', help, '</p>',
      '</div>'
    ].join("");
  }

  function durationOption(value, label) {
    return '<option value="' + value + '"' + (Number(current.duration) === value ? " selected" : "") + '>' + label + '</option>';
  }

  function hudCell(label, id, value, extra) {
    return '<div class="hud-cell ' + (extra || "") + '"><span>' + label + '</span><b id="' + id + '">' + value + '</b></div>';
  }

  function syncSetupMetrics() {
    if (!current) return;
    Object.keys(current.attrs).forEach(function (key) {
      var output = document.getElementById("out-" + key);
      if (output) output.textContent = current.attrs[key];
    });
    var impact = document.getElementById("impact-grid");
    if (!impact) return;
    if (current.game === "waiter") {
      impact.innerHTML = impactCell("Paciência", waiterPatience().toFixed(1) + "s") + impactCell("Reação", waiterQteTime().toFixed(2) + "s") + impactCell("Erro", "−" + waiterErrorCost()) + impactCell("Recorde", formatScore(bestScore("waiter")));
    } else {
      impact.innerHTML = impactCell("Stamina", stockMaxStamina()) + impactCell("Peso", "−" + Math.round(stockReduction() * 100) + "%") + impactCell("Reação", stockQteTime().toFixed(2) + "s") + impactCell("Alvo", stockTargetSize() + "px");
    }
  }

  function impactCell(label, value) {
    return '<div class="impact"><span>' + label + '</span><b>' + value + '</b></div>';
  }

  function renderBoard() {
    if (!current) return;
    var board = document.getElementById("board");
    if (!board) return;
    board.innerHTML = current.game === "waiter" ? renderWaiterBoard() : renderStockBoard();
    current.boardDirty = false;
    if (current.paused) {
      board.style.position = "relative";
      board.insertAdjacentHTML("beforeend", '<div class="pause-banner"><div class="pause-card"><strong>Pausado</strong><span>Toque em continuar quando estiver pronto.</span></div></div>');
    }
  }

  function renderWaiterBoard() {
    var selected = findById(current.queue, current.selected);
    var tickets = current.queue.length ? current.queue.map(function (order) {
      var ratio = clamp(order.time / order.maxTime, 0, 1);
      return [
        '<button class="ticket', current.selected === order.id ? " selected" : "", ratio < .28 ? " urgent" : "", '" type="button" data-order="', order.id, '">',
          '<span class="ticket-top"><span>Comanda #', pad(order.id, 2), '</span><b>', order.time.toFixed(1), 's</b></span>',
          '<span class="ticket-item">', order.item, '</span>',
          '<span class="ticket-meta"><span>Mesa ', order.table, '</span><span>', current.selected === order.id ? "Selecionado" : "Selecionar", '</span></span>',
          '<span class="mini-track"><i style="width:', Math.round(ratio * 100), '%"></i></span>',
        '</button>'
      ].join("");
    }).join("") : emptyState(current.running ? "As comandas estão chegando…" : "Inicie o turno para receber as primeiras comandas.");
    var tables = "";
    for (var n = 1; n <= 6; n += 1) {
      var waiting = current.queue.some(function (order) { return order.table === n; });
      var target = selected && selected.table === n;
      tables += '<button class="table-button' + (target ? " target" : "") + '" type="button" data-table="' + n + '"><i class="table-status' + (waiting ? " busy" : "") + '" aria-hidden="true"></i><b>Mesa ' + pad(n, 2) + '</b><small>' + (waiting ? "Cliente aguardando" : "Mesa livre") + '</small></button>';
    }
    return [
      '<section class="zone"><div class="zone-heading"><h3>Comandas</h3><span>', current.queue.length, '/6 na fila</span></div><div class="tickets">', tickets, '</div></section>',
      '<section class="zone"><div class="zone-heading"><h3>Salão</h3><span>Escolha a mesa</span></div><div class="tables">', tables, '</div>', renderLog(), '</section>'
    ].join("");
  }

  function renderStockBoard() {
    var selected = findById(current.queue, current.selected);
    var crates = current.queue.length ? current.queue.map(function (crate) {
      var effective = Math.max(.5, crate.weight * (1 - stockReduction()));
      return [
        '<button class="crate', current.selected === crate.id ? " selected" : "", '" type="button" draggable="true" data-crate="', crate.id, '">',
          '<span class="crate-top"><span>Caixa #', pad(crate.id, 2), '</span><span>Peso ', effective.toFixed(1), '</span></span>',
          '<span class="crate-name">', crate.name, '</span>',
          '<span class="crate-meta"><span>', categoryName(crate.category), '</span><span>', current.selected === crate.id ? "Selecionada" : "Selecionar", '</span></span>',
        '</button>'
      ].join("");
    }).join("") : emptyState(current.running ? "A próxima remessa está chegando…" : "Inicie o turno para descarregar as caixas.");
    var shelves = STOCK_CATEGORIES.map(function (category) {
      var target = selected && selected.category === category.id;
      return '<button class="shelf-button' + (target ? " target" : "") + '" type="button" data-shelf="' + category.id + '"><b>' + category.name + '</b><small>' + category.description + '</small></button>';
    }).join("");
    var staminaPct = current.maxStamina ? clamp(current.stamina / current.maxStamina * 100, 0, 100) : 100;
    return [
      '<section class="zone"><div class="zone-heading"><h3>Caixas</h3><span>', current.queue.length, '/6 aguardando</span></div><div class="crates">', crates, '</div><div class="stamina-wrap"><div class="stamina-label"><span>STAMINA</span><b id="stamina-text">', Math.round(current.stamina), ' / ', current.maxStamina, '</b></div><div class="stamina-track"><i id="stamina-track" style="width:', staminaPct, '%"></i></div></div></section>',
      '<section class="zone"><div class="zone-heading"><h3>Prateleiras</h3><span>Organize por categoria</span></div><div class="shelves">', shelves, '</div>', renderLog(), '</section>'
    ].join("");
  }

  function emptyState(text) {
    return '<div class="empty-state">' + text + '</div>';
  }

  function renderLog() {
    var items = current.logs.length ? current.logs.slice(0, 8).map(function (entry) {
      return '<div class="log-entry ' + entry.kind + '"><time>' + entry.time + '</time><span>' + entry.text + '</span></div>';
    }).join("") : '<div class="log-entry"><span>Nenhum evento ainda.</span></div>';
    return '<div class="log"><div class="log-title"><span>Ocorrências</span><span>Mais recente</span></div><div class="log-list">' + items + '</div></div>';
  }

  function startGame() {
    if (!current || current.running) return;
    var game = current.game;
    var attrs = Object.assign({}, current.attrs);
    var duration = Number(current.duration);
    openGame(game);
    current.attrs = attrs;
    current.duration = duration;
    current.timeLeft = duration;
    current.running = true;
    current.startedAt = performance.now();
    current.lastFrame = current.startedAt;
    current.nextSpawnAt = current.startedAt;
    current.nextEventAt = current.startedAt + eventDelay();
    if (game === "stock") {
      current.maxStamina = stockMaxStamina();
      current.stamina = current.maxStamina;
    }
    addLog("Turno iniciado. Boa sorte.", "good");
    if (game === "waiter") {
      spawnWaiter(); spawnWaiter(); spawnWaiter();
    } else {
      spawnStock(); spawnStock(); spawnStock(); spawnStock();
    }
    renderGame();
    beep("start");
    raf = requestAnimationFrame(tick);
  }

  function tick(now) {
    if (!current || !current.running) return;
    var dt = Math.min(.25, Math.max(0, (now - current.lastFrame) / 1000));
    current.lastFrame = now;

    if (!current.paused) {
      if (current.qte) {
        updateQte(now);
      } else {
        updateRound(dt, now);
      }
    }

    if (current && current.running && now - current.lastPaint > 90) {
      current.lastPaint = now;
      updateHUD();
      if (current.boardDirty) renderBoard(); else syncLiveBoard();
    }
    if (current && current.running) raf = requestAnimationFrame(tick);
  }

  function updateRound(dt, now) {
    if (current.duration > 0) {
      current.timeLeft = Math.max(0, current.timeLeft - dt);
      if (current.timeLeft <= 0) {
        finishRound();
        return;
      }
    }

    if (current.game === "waiter") {
      var expired = [];
      current.queue.forEach(function (order) {
        order.time -= dt;
        if (order.time <= 0) expired.push(order.id);
      });
      expired.forEach(expireWaiterOrder);
    } else {
      current.stamina = Math.min(current.maxStamina, current.stamina + dt * (1.45 + current.attrs.vigor * .38));
    }

    if (now >= current.nextSpawnAt) {
      if (current.game === "waiter") spawnWaiter(); else spawnStock();
      current.nextSpawnAt = now + spawnDelay();
    }
    if (now >= current.nextEventAt) startQte(now);
  }

  function spawnWaiter() {
    if (!current || !current.running || current.queue.length >= 6) return;
    var free = [];
    for (var table = 1; table <= 6; table += 1) {
      if (!current.queue.some(function (order) { return order.table === table; })) free.push(table);
    }
    if (!free.length) return;
    var maxTime = waiterPatience() * (.92 + Math.random() * .16);
    current.queue.push({
      id: current.nextId++,
      table: pick(free),
      item: pick(WAITER_ITEMS),
      time: maxTime,
      maxTime: maxTime
    });
    current.boardDirty = true;
  }

  function expireWaiterOrder(id) {
    var order = findById(current.queue, id);
    if (!order) return;
    var loss = Math.max(35, 95 - current.attrs.agility * 4);
    current.score -= loss;
    current.mistakes += 1;
    current.combo = Math.max(1, current.combo - 1);
    current.queue = current.queue.filter(function (item) { return item.id !== id; });
    if (current.selected === id) current.selected = null;
    addLog("Mesa " + order.table + " desistiu. <strong>−" + loss + "</strong>", "bad");
    current.boardDirty = true;
    beep("bad");
  }

  function deliverWaiter(table) {
    if (!canPlay()) return;
    var order = findById(current.queue, current.selected);
    if (!order) return toast("Selecione uma comanda primeiro.");
    if (order.table !== table) {
      var loss = waiterErrorCost();
      current.score -= loss;
      current.mistakes += 1;
      current.combo = Math.max(1, current.combo - 1);
      addLog("Mesa errada. <strong>−" + loss + "</strong>", "bad");
      feedback(false);
      return;
    }
    var speed = clamp(order.time / order.maxTime, 0, 1);
    var gain = Math.round((75 + speed * 90) * current.combo * (1 + current.attrs.precision * .018));
    current.score += gain;
    current.completed += 1;
    current.combo = speed > .46 ? Math.min(9, current.combo + 1) : Math.max(1, current.combo - 1);
    current.maxCombo = Math.max(current.maxCombo, current.combo);
    current.queue = current.queue.filter(function (item) { return item.id !== order.id; });
    current.selected = null;
    addLog(order.item + " na mesa " + table + ". <strong>+" + gain + "</strong>", "good");
    if (current.completed % 5 === 0) {
      current.level += 1;
      addLog("O salão ficou mais movimentado.", "");
      toast("Pressão aumentou para " + current.level + ".");
    }
    feedback(true);
    spawnWaiter();
  }

  function spawnStock() {
    if (!current || !current.running || current.queue.length >= 6) return;
    var category = pick(STOCK_CATEGORIES);
    current.queue.push({
      id: current.nextId++,
      category: category.id,
      name: pick(STOCK_NAMES[category.id]),
      weight: 1 + Math.floor(Math.random() * 5) + Math.floor(current.level / 4)
    });
    current.boardDirty = true;
  }

  function placeStock(category) {
    if (!canPlay()) return;
    var crate = findById(current.queue, current.selected);
    if (!crate) return toast("Selecione uma caixa primeiro.");
    if (crate.category !== category) {
      current.score -= 65;
      current.mistakes += 1;
      current.combo = Math.max(1, current.combo - 1);
      addLog("Prateleira errada. <strong>−65</strong>", "bad");
      feedback(false);
      return;
    }
    var cost = Math.max(4, crate.weight * 9 * (1 - stockReduction()));
    current.stamina = Math.max(0, current.stamina - cost);
    var fatigue = current.stamina / current.maxStamina;
    var gain = Math.round((70 + crate.weight * 15) * current.combo * (.66 + .34 * fatigue));
    current.score += gain;
    current.completed += 1;
    current.combo = Math.min(9, current.combo + 1);
    current.maxCombo = Math.max(current.maxCombo, current.combo);
    current.queue = current.queue.filter(function (item) { return item.id !== crate.id; });
    current.selected = null;
    addLog(crate.name + " guardado. <strong>+" + gain + "</strong>", "good");
    if (current.stamina <= 0) {
      current.score -= 110;
      current.combo = 1;
      current.stamina = current.maxStamina * .34;
      current.mistakes += 1;
      addLog("Você perdeu o fôlego. <strong>−110</strong>", "bad");
      toast("Sem stamina! Você precisou parar.");
    }
    if (current.completed % 6 === 0) {
      current.level += 1;
      addLog("O ritmo da reposição aumentou.", "");
      toast("Ritmo aumentou para " + current.level + ".");
    }
    feedback(true);
    spawnStock();
  }

  function startQte(now) {
    if (!current || !current.running || current.qte) return;
    var duration;
    if (current.game === "waiter") {
      var event = pick(WAITER_EVENTS);
      duration = waiterQteTime() * 1000;
      current.qte = { kind: "waiter", event: event, duration: duration, end: now + duration };
      modalRoot.innerHTML = [
        '<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="qte-title">',
          '<p class="eyebrow">Evento de reação</p><h2 id="qte-title">', event.title, '</h2><p>', event.text, ' Escolha a ação correta.</p>',
          '<div class="qte-clock"><i id="qte-track"></i></div>',
          '<div class="qte-answers">',
            qteAnswer("A", "Equilibrar"), qteAnswer("D", "Desviar"), qteAnswer("W", "Segurar"), qteAnswer("S", "Conferir"),
          '</div>',
        '</section></div>'
      ].join("");
    } else {
      var scene = pick(STOCK_EVENTS);
      duration = stockQteTime() * 1000;
      current.qte = { kind: "stock", event: scene, duration: duration, end: now + duration };
      modalRoot.innerHTML = [
        '<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="qte-title">',
          '<p class="eyebrow">Evento de reação</p><h2 id="qte-title">', scene.title, '</h2><p>', scene.text, '</p>',
          '<div class="reaction-arena" id="reaction-arena"><button class="reaction-target" type="button" data-qte-target aria-label="Interceptar">!</button></div>',
          '<div class="qte-clock"><i id="qte-track"></i></div>',
        '</section></div>'
      ].join("");
      requestAnimationFrame(placeReactionTarget);
    }
    beep("alert");
  }

  function qteAnswer(key, label) {
    return '<button class="btn qte-answer" type="button" data-qte-answer="' + key + '"><kbd>' + key + '</kbd>' + label + '</button>';
  }

  function placeReactionTarget() {
    if (!current || !current.qte || current.qte.kind !== "stock") return;
    var arena = document.getElementById("reaction-arena");
    var target = document.querySelector("[data-qte-target]");
    if (!arena || !target) return;
    var size = stockTargetSize();
    target.style.width = size + "px";
    target.style.height = size + "px";
    target.style.left = 8 + Math.random() * Math.max(0, arena.clientWidth - size - 16) + "px";
    target.style.top = 8 + Math.random() * Math.max(0, arena.clientHeight - size - 16) + "px";
    target.focus({ preventScroll: true });
  }

  function updateQte(now) {
    if (!current || !current.qte) return;
    var left = current.qte.end - now;
    var track = document.getElementById("qte-track");
    if (track) track.style.width = clamp(left / current.qte.duration * 100, 0, 100) + "%";
    if (left <= 0) finishQte(false);
  }

  function answerWaiterQte(key) {
    if (!current || !current.qte || current.qte.kind !== "waiter") return;
    finishQte(key === current.qte.event.action);
  }

  function finishQte(ok) {
    if (!current || !current.qte) return;
    if (ok) {
      var gain = 125 + current.level * 18 + current.attrs.agility * 4 + current.attrs.precision * 4;
      current.score += gain;
      if (current.game === "stock") current.stamina = Math.min(current.maxStamina, current.stamina + 10 + current.attrs.vigor);
      addLog("Imprevisto resolvido. <strong>+" + gain + "</strong>", "good");
      feedback(true);
    } else {
      var loss = Math.max(50, 150 - current.attrs.agility * 5 - current.attrs.precision * 5);
      current.score -= loss;
      current.mistakes += 1;
      current.combo = Math.max(1, current.combo - 1);
      if (current.game === "stock") current.stamina = Math.max(0, current.stamina - 12);
      addLog("Falha no imprevisto. <strong>−" + loss + "</strong>", "bad");
      feedback(false);
    }
    current.qte = null;
    current.nextEventAt = performance.now() + eventDelay();
    modalRoot.innerHTML = "";
    updateHUD();
    renderBoard();
  }

  function pauseGame(auto) {
    if (!current || !current.running) return;
    current.paused = !current.paused;
    current.autoPaused = !!auto && current.paused;
    current.lastFrame = performance.now();
    renderGame();
    if (!auto) toast(current.paused ? "Turno pausado." : "Turno retomado.");
  }

  function finishRound() {
    if (!current || !current.running) return;
    current.running = false;
    cancelAnimationFrame(raf);
    if (current.qte) {
      current.qte = null;
      modalRoot.innerHTML = "";
    }
    var score = Math.max(0, Math.floor(current.score));
    var record = storeBest(current.game, score);
    var rank = rankFor(score);
    beep("finish");
    modalRoot.innerHTML = [
      '<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="result-title">',
        '<p class="eyebrow">Fim do turno</p><h2 id="result-title">', record ? "Novo recorde" : "Resultado", '</h2>',
        '<div class="result-rank" aria-label="Rank ', rank, '">', rank, '</div>',
        '<p>', resultText(rank), '</p>',
        '<div class="result-grid">',
          resultCell("Pontos", formatScore(score)), resultCell(current.game === "waiter" ? "Entregues" : "Repostos", current.completed), resultCell("Erros", current.mistakes),
          resultCell("Melhor combo", "x" + current.maxCombo), resultCell("Nível", current.level), resultCell("Recorde", formatScore(bestScore(current.game))),
        '</div>',
        '<div class="modal-actions"><button class="btn primary" type="button" data-action="play-again">Jogar de novo</button><button class="btn" type="button" data-action="go-lobby">Voltar à central</button></div>',
      '</section></div>'
    ].join("");
    renderGame();
  }

  function resultCell(label, value) {
    return '<div><span>' + label + '</span><b>' + value + '</b></div>';
  }

  function rankFor(score) {
    var seconds = current.duration > 0 ? current.duration : Math.max(30, (performance.now() - current.startedAt) / 1000);
    var perMinute = score / seconds * 60;
    if (perMinute >= 9000) return "S";
    if (perMinute >= 6000) return "A";
    if (perMinute >= 3500) return "B";
    if (perMinute >= 1700) return "C";
    return "D";
  }

  function resultText(rank) {
    if (rank === "S") return "Um turno impecável. Até o gerente ficou sem críticas.";
    if (rank === "A") return "Excelente desempenho: rápido, preciso e quase sem desperdício.";
    if (rank === "B") return "Bom trabalho. Você segurou a pressão e manteve o turno funcionando.";
    if (rank === "C") return "Turno concluído, mas a Anteiku cobrou cada segundo de distração.";
    return "A correria venceu desta vez. Ajuste os atributos e tente de novo.";
  }

  function resetToSetup() {
    if (!current) return;
    var game = current.game;
    openGame(game);
    toast("Turno limpo. Ajuste a ficha e comece quando quiser.");
  }

  function cleanupGame() {
    cancelAnimationFrame(raf);
    raf = 0;
    current = null;
    modalRoot.innerHTML = "";
  }

  function updateHUD() {
    if (!current) return;
    setText("hud-time", current.duration === 0 ? "∞" : formatTime(current.timeLeft));
    setText("hud-score", formatScore(Math.max(0, current.score)));
    setText("hud-combo", "x" + current.combo);
    setText("hud-done", current.completed);
    setText("hud-errors", current.mistakes);
    setText("hud-level", current.level);
    var track = document.getElementById("round-track");
    if (track) track.style.width = current.duration > 0 ? clamp(current.timeLeft / current.duration * 100, 0, 100) + "%" : "100%";
  }

  function syncLiveBoard() {
    if (!current) return;
    if (current.game === "waiter") {
      current.queue.forEach(function (order) {
        var card = document.querySelector('[data-order="' + order.id + '"]');
        if (!card) return;
        var time = card.querySelector(".ticket-top b");
        var fill = card.querySelector(".mini-track i");
        var ratio = clamp(order.time / order.maxTime, 0, 1);
        if (time) time.textContent = order.time.toFixed(1) + "s";
        if (fill) fill.style.width = Math.round(ratio * 100) + "%";
        card.classList.toggle("urgent", ratio < .28);
      });
    } else {
      var staminaText = document.getElementById("stamina-text");
      var staminaTrack = document.getElementById("stamina-track");
      if (staminaText) staminaText.textContent = Math.round(current.stamina) + " / " + current.maxStamina;
      if (staminaTrack) staminaTrack.style.width = clamp(current.stamina / current.maxStamina * 100, 0, 100) + "%";
    }
  }

  function addLog(text, kind) {
    if (!current) return;
    current.logs.unshift({ time: formatTime(current.timeLeft), text: text, kind: kind || "" });
    current.logs = current.logs.slice(0, 18);
    current.boardDirty = true;
  }

  function canPlay() {
    return current && current.running && !current.paused && !current.qte;
  }

  function waiterPatience() {
    return Math.max(4.6, 7.1 + current.attrs.agility * .62 + current.attrs.precision * .2 - (current.level - 1) * .28);
  }

  function waiterQteTime() {
    return Math.max(.8, 1.08 + current.attrs.agility * .085 + current.attrs.precision * .055 - (current.level - 1) * .025);
  }

  function waiterErrorCost() {
    return Math.max(25, 95 - current.attrs.precision * 5);
  }

  function stockReduction() {
    return Math.min(.58, current.attrs.strength * .05);
  }

  function stockMaxStamina() {
    return 90 + current.attrs.vigor * 8;
  }

  function stockQteTime() {
    return Math.max(.8, 1.05 + current.attrs.agility * .08 + current.attrs.precision * .05 - (current.level - 1) * .02);
  }

  function stockTargetSize() {
    return Math.min(104, 54 + current.attrs.precision * 4);
  }

  function spawnDelay() {
    return Math.max(980, 2050 - (current.level - 1) * 95);
  }

  function eventDelay() {
    return 7600 + Math.random() * 5000 - Math.min(2300, current.level * 150);
  }

  function categoryName(id) {
    var item = STOCK_CATEGORIES.find(function (category) { return category.id === id; });
    return item ? item.name : "";
  }

  function feedback(ok) {
    beep(ok ? "good" : "bad");
    if (navigator.vibrate) navigator.vibrate(ok ? 18 : [28, 40, 28]);
  }

  function beep(type) {
    if (!prefs.sound) return;
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      var oscillator = audioContext.createOscillator();
      var gain = audioContext.createGain();
      var now = audioContext.currentTime;
      var frequency = type === "bad" ? 135 : type === "alert" ? 430 : type === "finish" ? 660 : type === "start" ? 330 : 560;
      oscillator.type = type === "bad" ? "sawtooth" : "sine";
      oscillator.frequency.setValueAtTime(frequency, now);
      if (type === "good" || type === "finish") oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.42, now + .11);
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(.08, now + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, now + .16);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + .17);
    } catch {}
  }

  function toast(message) {
    clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.classList.add("show");
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2300);
  }

  function setNav(game) {
    document.querySelectorAll("[data-view]").forEach(function (button) {
      if (button.closest(".game-nav")) button.classList.toggle("active", button.dataset.view === game);
    });
  }

  function setText(id, value) {
    var element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function formatScore(value) {
    return Math.max(0, Math.floor(Number(value) || 0)).toLocaleString("pt-BR");
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds === 0 && current && current.duration === 0) return "∞";
    var clean = Math.max(0, Math.ceil(Number(seconds) || 0));
    return Math.floor(clean / 60) + ":" + String(clean % 60).padStart(2, "0");
  }

  function pad(value, length) { return String(value).padStart(length, "0"); }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function findById(list, id) { return list.find(function (item) { return item.id === id; }) || null; }

  document.addEventListener("click", function (event) {
    var actionTarget = event.target.closest("[data-action]");
    var viewTarget = event.target.closest("[data-view]");
    if (viewTarget) {
      openGame(viewTarget.dataset.view);
      return;
    }
    if (actionTarget) {
      var action = actionTarget.dataset.action;
      if (action === "go-lobby") renderLobby();
      if (action === "toggle-theme") {
        prefs.theme = prefs.theme === "dark" ? "light" : "dark";
        savePrefs(); applyPrefs();
      }
      if (action === "toggle-sound") {
        prefs.sound = !prefs.sound;
        savePrefs(); applyPrefs();
        if (prefs.sound) beep("good");
        toast(prefs.sound ? "Som ativado." : "Som desativado.");
      }
      if (action === "primary-game") {
        if (!current.running) startGame(); else pauseGame(false);
      }
      if (action === "secondary-game") {
        if (current && current.running) finishRound(); else resetToSetup();
      }
      if (action === "play-again") startGame();
      return;
    }

    var order = event.target.closest("[data-order]");
    if (order && canPlay()) {
      current.selected = Number(order.dataset.order);
      renderBoard();
      beep("start");
      return;
    }
    var table = event.target.closest("[data-table]");
    if (table) {
      deliverWaiter(Number(table.dataset.table));
      renderBoard(); updateHUD();
      return;
    }
    var crate = event.target.closest("[data-crate]");
    if (crate && canPlay()) {
      current.selected = Number(crate.dataset.crate);
      renderBoard();
      beep("start");
      return;
    }
    var shelf = event.target.closest("[data-shelf]");
    if (shelf) {
      placeStock(shelf.dataset.shelf);
      renderBoard(); updateHUD();
      return;
    }
    var qteAnswerButton = event.target.closest("[data-qte-answer]");
    if (qteAnswerButton) {
      answerWaiterQte(qteAnswerButton.dataset.qteAnswer);
      return;
    }
    if (event.target.closest("[data-qte-target]")) {
      finishQte(true);
      return;
    }
    if (event.target.closest("#reaction-arena") && current && current.qte) finishQte(false);
  });

  screen.addEventListener("input", function (event) {
    var input = event.target.closest("[data-attr]");
    if (!input || !current || current.running) return;
    current.attrs[input.dataset.attr] = Number(input.value);
    prefs[current.game][input.dataset.attr] = Number(input.value);
    savePrefs();
    if (current.game === "stock" && input.dataset.attr === "vigor") {
      current.maxStamina = stockMaxStamina();
      current.stamina = current.maxStamina;
      renderBoard();
    }
    syncSetupMetrics();
  });

  screen.addEventListener("change", function (event) {
    var select = event.target.closest("[data-duration]");
    if (!select || !current || current.running) return;
    current.duration = Number(select.value);
    current.timeLeft = current.duration;
    prefs[current.game].duration = current.duration;
    savePrefs();
    updateHUD();
  });

  screen.addEventListener("dragstart", function (event) {
    var crate = event.target.closest("[data-crate]");
    if (!crate || !canPlay()) return;
    current.selected = Number(crate.dataset.crate);
    if (event.dataTransfer) event.dataTransfer.setData("text/plain", String(current.selected));
  });

  screen.addEventListener("dragover", function (event) {
    if (event.target.closest("[data-shelf]")) event.preventDefault();
  });

  screen.addEventListener("drop", function (event) {
    var shelf = event.target.closest("[data-shelf]");
    if (!shelf) return;
    event.preventDefault();
    placeStock(shelf.dataset.shelf);
    renderBoard(); updateHUD();
  });

  window.addEventListener("keydown", function (event) {
    if (!current) return;
    if (current.qte && current.qte.kind === "waiter") {
      var key = String(event.key || "").toUpperCase();
      if (["W", "A", "S", "D"].indexOf(key) !== -1) {
        event.preventDefault();
        answerWaiterQte(key);
      }
      return;
    }
    if (event.code === "Space" && current.running && !current.qte) {
      event.preventDefault();
      pauseGame(false);
    }
  });

  document.addEventListener("visibilitychange", function () {
    if (!current || !current.running) return;
    if (document.hidden && !current.paused) {
      current.paused = true;
      current.autoPaused = true;
      if (current.qte) current.qte.remaining = Math.max(0, current.qte.end - performance.now());
    } else if (!document.hidden && current.autoPaused) {
      current.paused = false;
      current.autoPaused = false;
      current.lastFrame = performance.now();
      if (current.qte && current.qte.remaining != null) current.qte.end = performance.now() + current.qte.remaining;
      renderGame();
      toast("Turno retomado.");
    }
  });
})();
