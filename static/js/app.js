/* ===== SOLOQ CHALLENGE — Frontend ===== */

// -- State --
const state = {
  data:           null,
  activeSite:     'opgg',
  activePlayer:   0,
  chart:          null,
  pollId:         null,
};

// -- DOM refs --
const $overlay    = document.getElementById('loading-overlay');
const $noKeyBanner= document.getElementById('no-key-banner');
const $errBanner  = document.getElementById('error-banner');
const $errText    = document.getElementById('error-text');
const $app        = document.getElementById('app');
const $tbody      = document.getElementById('ranking-tbody');
const $tabs       = document.getElementById('player-tabs');
const $card       = document.getElementById('player-card-section');
const $legend     = document.getElementById('chart-legend');
const $chartEmpty = document.getElementById('chart-empty');
const $updateTime = document.getElementById('update-time');
const $refreshBtn = document.getElementById('refresh-btn');
const $siteTabs   = document.querySelectorAll('.site-tab');
const $refreshToast    = document.getElementById('refresh-toast');
const $refreshToastMsg = document.getElementById('refresh-toast-msg');

// -- Helpers --
function hide(el) { el.hidden = true; }
function show(el) { el.hidden = false; }

function timeAgo(iso) {
  if (!iso) return '—';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60)    return 'hace unos segundos';
  if (s < 3600)  return 'hace ' + Math.round(s / 60) + ' min';
  if (s < 86400) return 'hace ' + Math.round(s / 3600) + ' h';
  return 'hace ' + Math.round(s / 86400) + ' días';
}

function tierClass(tier) {
  return 'tier-' + (tier || 'UNRANKED').toUpperCase();
}

function tierLabel(tier, division) {
  const labels = {
    CHALLENGER: 'Challenger', GRANDMASTER: 'Gran Master', MASTER: 'Master',
    DIAMOND: 'Diamante', EMERALD: 'Esmeralda', PLATINUM: 'Platino',
    GOLD: 'Oro', SILVER: 'Plata', BRONZE: 'Bronce', IRON: 'Hierro',
    UNRANKED: 'Sin Rankear',
  };
  const t = (tier || 'UNRANKED').toUpperCase();
  const name = labels[t] || tier;
  if (['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(t)) return name;
  return division ? `${name} ${division}` : name;
}

// SVG rank icons — no external CDN needed
function rankSvg(tier) {
  const C = {
    IRON:        { main: '#8a8585', dark: '#4a4848', light: '#b0abab' },
    BRONZE:      { main: '#c17930', dark: '#7a420e', light: '#e0a050' },
    SILVER:      { main: '#a6adb4', dark: '#5c6975', light: '#d0d7de' },
    GOLD:        { main: '#d4af37', dark: '#a07b0a', light: '#f0cc55' },
    PLATINUM:    { main: '#4fc7b9', dark: '#1e7a72', light: '#7de0d8' },
    EMERALD:     { main: '#52c788', dark: '#1a6e44', light: '#7ae0aa' },
    DIAMOND:     { main: '#64dcdc', dark: '#2a6db5', light: '#90eeee' },
    MASTER:      { main: '#b077e8', dark: '#6a1ea0', light: '#d0a0ff' },
    GRANDMASTER: { main: '#e84057', dark: '#900020', light: '#ff7090' },
    CHALLENGER:  { main: '#f4c842', dark: '#b07a00', light: '#ffe080' },
  };
  const c = C[tier] || C.IRON;

  // Wings shape: two mirrored bezier wings + center diamond
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="40" height="40">
    <defs>
      <linearGradient id="g_${tier}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${c.dark}"/>
        <stop offset="100%" stop-color="${c.light}"/>
      </linearGradient>
      <filter id="sh_${tier}" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="${c.dark}" flood-opacity="0.7"/>
      </filter>
    </defs>
    <!-- Left wing -->
    <path d="M24 10 L6 22 L10 34 L18 28 L20 36 L24 38 Z"
          fill="url(#g_${tier})" filter="url(#sh_${tier})" opacity="0.9"/>
    <!-- Right wing (mirrored) -->
    <path d="M24 10 L42 22 L38 34 L30 28 L28 36 L24 38 Z"
          fill="url(#g_${tier})" filter="url(#sh_${tier})" opacity="0.9"/>
    <!-- Center diamond -->
    <polygon points="24,8 29,20 24,28 19,20"
             fill="${c.main}" stroke="${c.light}" stroke-width="0.8"
             filter="url(#sh_${tier})"/>
    <!-- Inner highlight -->
    <polygon points="24,11 27,19 24,25 21,19"
             fill="${c.light}" opacity="0.35"/>
  </svg>`;
}

function eloEmblemHtml(player) {
  const tier = (player.tier || 'UNRANKED').toUpperCase();

  const TIER_NAME_ES = {
    IRON: 'Hierro', BRONZE: 'Bronce', SILVER: 'Plata', GOLD: 'Oro',
    PLATINUM: 'Platino', EMERALD: 'Esmeralda', DIAMOND: 'Diamante',
    MASTER: 'Master', GRANDMASTER: 'Gran Master', CHALLENGER: 'Challenger',
    UNRANKED: 'Sin Rankear',
  };

  if (tier === 'UNRANKED') {
    return `<div class="elo-emblem">
      <div class="elo-emblem-svg elo-emblem-placeholder"></div>
      <div class="elo-emblem-text">
        <span class="elo-emblem-tier">Sin Rankear</span>
      </div>
    </div>`;
  }

  const tierName = TIER_NAME_ES[tier] || tier;
  const isApex   = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(tier);
  const divLabel = (!isApex && player.division) ? ` ${player.division}` : '';
  const lpLabel  = `${player.lp || 0} LP`;

  return `<div class="elo-emblem">
    <div class="elo-emblem-svg">${rankSvg(tier)}</div>
    <div class="elo-emblem-text">
      <span class="elo-emblem-tier tier-text-${tier}">${tierName}${divLabel}</span>
      <span class="elo-emblem-lp">${lpLabel}</span>
    </div>
  </div>`;
}

function wrClass(wr) {
  return wr >= 55 ? 'green' : wr >= 50 ? '' : '';
}

function siteUrl(player, site) {
  if (!player) return '#';
  if (site === 'opgg')  return player.opgg_url  || '#';
  if (site === 'ugg')   return player.ugg_url   || '#';
  if (site === 'logs')  return player.logs_url  || '#';
  return '#';
}

// -- Site tab links --
function updateSiteTabLinks() {
  if (!state.data) return;
  $siteTabs.forEach(tab => {
    const site = tab.dataset.site;
    tab.classList.toggle('active', site === state.activeSite);
    // Keep them as anchor tags — click opens current active player's profile
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      state.activeSite = site;
      $siteTabs.forEach(t => t.classList.toggle('active', t.dataset.site === site));
      const p = state.data.players[state.activePlayer];
      if (p) window.open(siteUrl(p, site), '_blank');
    });
  });
}

// -- Ranking table --
function renderTable(players) {
  if (!players || !players.length) {
    $tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-dim)">Sin datos</td></tr>';
    return;
  }

  $tbody.innerHTML = players.map((p, idx) => {
    const rankCls   = idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : '';
    const isActive  = idx === state.activePlayer;

    // Avatar
    const avatar = p.profile_icon
      ? `<img class="player-avatar" src="${p.profile_icon}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        + `<div class="player-avatar-placeholder" style="display:none">${p.name[0].toUpperCase()}</div>`
      : `<div class="player-avatar-placeholder">${p.name[0].toUpperCase()}</div>`;

    // Account link
    const accUrl = siteUrl(p, state.activeSite);

    return `
      <tr data-idx="${idx}" class="${isActive ? 'active-row' : ''}" onclick="selectPlayer(${idx})">
        <td><div class="td-rank ${rankCls}">${p.rank || idx + 1}</div></td>
        <td>
          <div class="player-cell">
            ${avatar}
            <div>
              <div class="player-name">${escHtml(p.name)}</div>
              <div class="player-level">Nv. ${p.level || '?'}</div>
            </div>
          </div>
        </td>
        <td>
          <div class="account-cell">
            <div>
              <div class="account-name">${escHtml(p.gameName || p.name)}</div>
              <div class="account-tag">#${escHtml(p.tagLine)}</div>
            </div>
            <a href="${accUrl}" target="_blank" class="ext-link" onclick="event.stopPropagation()">↗ OP.GG</a>
          </div>
        </td>
        <td>
          <div class="elo-cell">
            ${eloEmblemHtml(p)}
          </div>
        </td>
        <td>
          <div class="wl-cell">
            <div>
              <span class="wl-wins">${p.wins || 0}W</span>
              <span class="wl-slash">/</span>
              <span class="wl-losses">${p.losses || 0}L</span>
            </div>
            <div class="wr-text">${p.wr || 0}% WR</div>
          </div>
        </td>
      </tr>`;
  }).join('');
}

// ── Rank ladder ───────────────────────────────────────────────────────────
const RANK_LADDER = [
  { abbr: 'I4',  lp: 0,    tier: 'IRON'        },
  { abbr: 'I3',  lp: 100,  tier: 'IRON'        },
  { abbr: 'I2',  lp: 200,  tier: 'IRON'        },
  { abbr: 'I1',  lp: 300,  tier: 'IRON'        },
  { abbr: 'B4',  lp: 400,  tier: 'BRONZE'      },
  { abbr: 'B3',  lp: 500,  tier: 'BRONZE'      },
  { abbr: 'B2',  lp: 600,  tier: 'BRONZE'      },
  { abbr: 'B1',  lp: 700,  tier: 'BRONZE'      },
  { abbr: 'S4',  lp: 800,  tier: 'SILVER'      },
  { abbr: 'S3',  lp: 900,  tier: 'SILVER'      },
  { abbr: 'S2',  lp: 1000, tier: 'SILVER'      },
  { abbr: 'S1',  lp: 1100, tier: 'SILVER'      },
  { abbr: 'G4',  lp: 1200, tier: 'GOLD'        },
  { abbr: 'G3',  lp: 1300, tier: 'GOLD'        },
  { abbr: 'G2',  lp: 1400, tier: 'GOLD'        },
  { abbr: 'G1',  lp: 1500, tier: 'GOLD'        },
  { abbr: 'P4',  lp: 1600, tier: 'PLATINUM'    },
  { abbr: 'P3',  lp: 1700, tier: 'PLATINUM'    },
  { abbr: 'P2',  lp: 1800, tier: 'PLATINUM'    },
  { abbr: 'P1',  lp: 1900, tier: 'PLATINUM'    },
  { abbr: 'E4',  lp: 2000, tier: 'EMERALD'     },
  { abbr: 'E3',  lp: 2100, tier: 'EMERALD'     },
  { abbr: 'E2',  lp: 2200, tier: 'EMERALD'     },
  { abbr: 'E1',  lp: 2300, tier: 'EMERALD'     },
  { abbr: 'D4',  lp: 2400, tier: 'DIAMOND'     },
  { abbr: 'D3',  lp: 2500, tier: 'DIAMOND'     },
  { abbr: 'D2',  lp: 2600, tier: 'DIAMOND'     },
  { abbr: 'D1',  lp: 2700, tier: 'DIAMOND'     },
  { abbr: 'M',   lp: 2800, tier: 'MASTER'      },
  { abbr: 'GM',  lp: 3100, tier: 'GRANDMASTER' },
  { abbr: 'C',   lp: 3500, tier: 'CHALLENGER'  },
];

const TIER_BAND_BG = {
  IRON:        'rgba(138,133,133,0.07)',
  BRONZE:      'rgba(193,121,48,0.07)',
  SILVER:      'rgba(166,173,180,0.07)',
  GOLD:        'rgba(212,175,55,0.08)',
  PLATINUM:    'rgba(79,199,185,0.08)',
  EMERALD:     'rgba(82,199,136,0.08)',
  DIAMOND:     'rgba(100,220,220,0.09)',
  MASTER:      'rgba(176,119,232,0.11)',
  GRANDMASTER: 'rgba(232,64,87,0.11)',
  CHALLENGER:  'rgba(244,200,66,0.11)',
};

const TIER_COLOR_HEX = {
  IRON: '#8a8585', BRONZE: '#c17930', SILVER: '#a6adb4', GOLD: '#d4af37',
  PLATINUM: '#4fc7b9', EMERALD: '#52c788', DIAMOND: '#64dcdc',
  MASTER: '#b077e8', GRANDMASTER: '#e84057', CHALLENGER: '#f4c842',
};

function lpToRankLabel(totalLp) {
  if (totalLp === null || totalLp === undefined) return '—';
  for (let i = RANK_LADDER.length - 1; i >= 0; i--) {
    if (totalLp >= RANK_LADDER[i].lp) {
      const rank = RANK_LADDER[i];
      const rem  = Math.round(totalLp - rank.lp);
      return rem > 0 ? `${rank.abbr} +${rem}` : rank.abbr;
    }
  }
  return `${Math.round(totalLp)} LP`;
}

function lpToTierColor(totalLp) {
  for (let i = RANK_LADDER.length - 1; i >= 0; i--) {
    if (totalLp >= RANK_LADDER[i].lp)
      return TIER_COLOR_HEX[RANK_LADDER[i].tier] || '#6e7681';
  }
  return '#6e7681';
}

// Custom plugin: draws tier background bands behind the chart
const rankBandPlugin = {
  id: 'rankBands',
  beforeDraw(chart) {
    const { ctx, chartArea, scales: { y } } = chart;
    if (!y || !chartArea) return;
    const { top, bottom, left, right } = chartArea;

    const BANDS = [
      { tier: 'IRON',        from: 0,    to: 400  },
      { tier: 'BRONZE',      from: 400,  to: 800  },
      { tier: 'SILVER',      from: 800,  to: 1200 },
      { tier: 'GOLD',        from: 1200, to: 1600 },
      { tier: 'PLATINUM',    from: 1600, to: 2000 },
      { tier: 'EMERALD',     from: 2000, to: 2400 },
      { tier: 'DIAMOND',     from: 2400, to: 2800 },
      { tier: 'MASTER',      from: 2800, to: 3100 },
      { tier: 'GRANDMASTER', from: 3100, to: 3500 },
      { tier: 'CHALLENGER',  from: 3500, to: 4200 },
    ];

    ctx.save();
    for (const b of BANDS) {
      const yTop    = y.getPixelForValue(b.to);
      const yBottom = y.getPixelForValue(b.from);
      const clipT   = Math.max(yTop,    top);
      const clipB   = Math.min(yBottom, bottom);
      if (clipT >= clipB) continue;
      ctx.fillStyle = TIER_BAND_BG[b.tier] || 'transparent';
      ctx.fillRect(left, clipT, right - left, clipB - clipT);
    }
    ctx.restore();
  },
};

// -- LP Chart --
function buildChartData(lpHistory, players, lastUpdated) {
  if (!lpHistory || !players) return null;
  return players.map(p => {
    const hist   = lpHistory[p.riotId] || [];
    const points = hist.map(h => ({ x: new Date(h.timestamp), y: h.total_lp }));

    // Always ensure the player's current LP is represented as the most recent point.
    // This anchors new players (no history yet) and keeps the line up-to-date.
    const currentLp = p.total_lp;
    if (currentLp != null && currentLp > 0) {
      const anchorTime = lastUpdated ? new Date(lastUpdated) : new Date();
      const lastPt     = points[points.length - 1];
      // Add anchor if there are no points OR if the last recorded LP differs from current
      if (!lastPt || Math.abs(lastPt.y - currentLp) > 1) {
        points.push({ x: anchorTime, y: currentLp });
      }
      // Sort chronologically (safety, in case history was out of order)
      points.sort((a, b) => a.x - b.x);
    }

    return {
      label:            p.name,
      data:             points,
      borderColor:      p.color || '#ffffff',
      backgroundColor:  p.color || '#ffffff',
      pointRadius:      3,
      pointHoverRadius: 6,
      tension:          0.3,
      borderWidth:      2,
      fill:             false,
    };
  });
}

function renderChart(lpHistory, players, lastUpdated) {
  const canvas   = document.getElementById('lp-chart');
  const ctx      = canvas.getContext('2d');
  const datasets = buildChartData(lpHistory, players, lastUpdated);
  const total    = (datasets || []).reduce((a, d) => a + d.data.length, 0);

  if (!datasets || total === 0) {
    canvas.hidden = true;
    show($chartEmpty);
    return;
  }
  canvas.hidden = false;
  hide($chartEmpty);

  if (state.chart) { state.chart.destroy(); state.chart = null; }

  // Dynamic Y range based on player data
  const allLP = datasets.flatMap(d => d.data.map(p => p.y)).filter(v => v != null);
  const minLP = allLP.length ? Math.min(...allLP) : 0;
  const maxLP = allLP.length ? Math.max(...allLP) : 2800;
  // Snap to nearest tier boundary below/above
  const yMin = Math.max(0,    Math.floor(minLP / 400) * 400 - 400);
  const yMax = Math.min(4200, Math.ceil(maxLP  / 400) * 400 + 400);

  // Ticks: one per division (every 100 LP), within the visible range
  const visibleTicks = RANK_LADDER.filter(r => r.lp >= yMin && r.lp <= yMax);

  state.chart = new Chart(ctx, {
    type: 'line',
    data: { datasets },
    plugins: [rankBandPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(13,17,23,0.95)',
          borderColor: '#30363d',
          borderWidth: 1,
          titleColor: '#e6edf3',
          bodyColor: '#848d97',
          padding: 12,
          callbacks: {
            title: items => {
              const d = new Date(items[0].raw.x);
              return d.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'short' });
            },
            label: item => {
              const label = lpToRankLabel(item.raw.y);
              return ` ${item.dataset.label}: ${label}`;
            },
          },
        },
        zoom: {
          zoom: { wheel: { enabled: true, speed: 0.08 }, pinch: { enabled: true }, mode: 'xy' },
          pan:  { enabled: true, mode: 'xy' },
          limits: { y: { min: 0, max: 4200 } },
        },
      },
      scales: {
        x: {
          type: 'time',
          time: { unit: 'day' },
          // Pin the axis from challenge start date to +120 days
          // so the chart always shows the full 4-month window.
          min: new Date('2026-04-20').getTime(),
          max: new Date('2026-08-18').getTime(),
          grid:   { color: 'rgba(48,54,61,0.4)' },
          ticks:  { color: '#6e7681', font: { size: 10 }, maxTicksLimit: 16 },
          border: { color: '#30363d' },
        },
        y: {
          min: yMin,
          max: yMax,
          afterBuildTicks(scale) {
            scale.ticks = visibleTicks.map(r => ({ value: r.lp }));
          },
          grid:   { color: 'rgba(48,54,61,0.4)' },
          border: { color: '#30363d' },
          ticks: {
            font:       { size: 10, weight: '600' },
            padding:    4,
            autoSkip:   false,
            color(ctx) {
              const v    = ctx.tick.value;
              const rank = RANK_LADDER.find(r => r.lp === v);
              return rank ? (TIER_COLOR_HEX[rank.tier] || '#6e7681') : '#6e7681';
            },
            callback(value) {
              const rank = RANK_LADDER.find(r => r.lp === value);
              return rank ? rank.abbr : '';
            },
          },
        },
      },
    },
  });

  // Legend — clickable to toggle dataset visibility
  $legend.innerHTML = players.map((p, i) =>
    `<div class="legend-item" data-idx="${i}" onclick="toggleDataset(${i})" title="Mostrar/ocultar">
       <span class="legend-dot" style="background:${p.color}"></span>
       <span class="legend-name">${escHtml(p.name)}</span>
     </div>`
  ).join('');
}

window.toggleDataset = function(idx) {
  if (!state.chart) return;
  const ds  = state.chart.data.datasets[idx];
  ds.hidden = !ds.hidden;
  state.chart.update();

  // Update legend item appearance
  const items = $legend.querySelectorAll('.legend-item');
  if (items[idx]) items[idx].classList.toggle('legend-hidden', ds.hidden);
};

// -- Player tabs --
function renderTabs(players) {
  $tabs.innerHTML = players.map((p, i) =>
    `<button class="player-tab${i === state.activePlayer ? ' active' : ''}"
             onclick="selectPlayer(${i})">
       ${escHtml(p.name.toUpperCase())}
     </button>`
  ).join('');
}

// -- Player detail card --
function renderCard(player) {
  if (!player) {
    $card.innerHTML = '';
    return;
  }

  // Avatar
  const avatar = player.profile_icon
    ? `<img class="card-avatar" src="${player.profile_icon}" alt=""
            onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
       <div class="card-avatar-placeholder" style="display:none">${player.name[0].toUpperCase()}</div>`
    : `<div class="card-avatar-placeholder">${player.name[0].toUpperCase()}</div>`;

  // Stats row
  const stats = `
    <div class="card-stats">
      <div class="card-stat">
        <div class="stat-value">${player.total_games || player.wins + player.losses || 0}</div>
        <div class="stat-label-sm">Partidas</div>
      </div>
      <div class="card-stat">
        <div class="stat-value ${wrClass(player.wr)}">${player.wr || 0}%</div>
        <div class="stat-label-sm">Win Rate</div>
      </div>
      <div class="card-stat">
        <div class="stat-value">${player.kda || 0}</div>
        <div class="stat-label-sm">KDA</div>
      </div>
      <div class="card-stat">
        <div class="stat-value">${player.avg_cs_min || 0}</div>
        <div class="stat-label-sm">CS / min</div>
      </div>
      <div class="card-stat">
        <div class="stat-value">${player.avg_duration || '00:00'}</div>
        <div class="stat-label-sm">Duración</div>
      </div>
    </div>`;

  // Top champions
  const champHtml = (player.top_champs && player.top_champs.length)
    ? `<div class="top-champs-title">CAMPEONES TOP (últimas 10 partidas)</div>
       <div class="top-champs">
         ${player.top_champs.map(c => `
           <div class="champ-chip">
             <img class="champ-chip-img" src="${c.champion_img}" alt="${escHtml(c.champion)}"
                  onerror="this.src='https://ddragon.leagueoflegends.com/cdn/img/champion/tiles/Lux_0.jpg'">
             <div class="champ-chip-info">
               <div class="champ-chip-name">${escHtml(c.champion)}</div>
               <div class="champ-chip-wr ${c.wr >= 55 ? 'high' : c.wr < 45 ? 'low' : ''}">
                 ${c.wr}% · ${c.games}G
               </div>
             </div>
           </div>`).join('')}
       </div>`
    : '';

  // Rank progress bar
  const rankBar = buildRankBar(player, state.data && state.data.apex_thresholds);

  // Match history
  const playerLpHist = (state.data && state.data.lp_history && state.data.lp_history[player.riotId]) || [];
  const matchesHtml = buildMatchList(player.matches || [], playerLpHist);

  // Error notice
  const errorHtml = player.error
    ? `<div class="card-error">⚠ Error al cargar: ${escHtml(player.error)}</div>`
    : '';

  $card.innerHTML = `
    <div class="player-card-header">
      ${avatar}
      <div class="card-name-wrap">
        <div class="card-name">${escHtml(player.name)}</div>
        <div class="card-riot-id">${escHtml(player.riotId)}</div>
      </div>
      <div style="margin-left:auto;display:flex;gap:8px">
        <a href="${player.opgg_url}" target="_blank" class="ext-link">↗ OP.GG</a>
        <a href="${player.logs_url}" target="_blank" class="ext-link">↗ Graphs</a>
      </div>
    </div>
    ${errorHtml}
    ${stats}
    ${champHtml}
    ${rankBar}
    ${matchesHtml}`;
}

function buildRankBar(player, apexThresholds) {
  const tier = (player.tier || 'UNRANKED').toUpperCase();
  if (tier === 'UNRANKED') return '';

  const TIER_NAME = {
    IRON: 'Hierro', BRONZE: 'Bronce', SILVER: 'Plata', GOLD: 'Oro',
    PLATINUM: 'Platino', EMERALD: 'Esmeralda', DIAMOND: 'Diamante',
    MASTER: 'Master', GRANDMASTER: 'Gran Master', CHALLENGER: 'Challenger',
  };
  const TIER_ABBR = {
    IRON: 'H', BRONZE: 'B', SILVER: 'S', GOLD: 'G',
    PLATINUM: 'P', EMERALD: 'E', DIAMOND: 'D',
    MASTER: 'M', GRANDMASTER: 'GM', CHALLENGER: 'C',
  };
  const NEXT_TIER = {
    IRON: 'BRONZE', BRONZE: 'SILVER', SILVER: 'GOLD', GOLD: 'PLATINUM',
    PLATINUM: 'EMERALD', EMERALD: 'DIAMOND', DIAMOND: 'MASTER',
  };
  const TIER_COLOR = {
    IRON: '#8a8585', BRONZE: '#c17930', SILVER: '#a6adb4', GOLD: '#d4af37',
    PLATINUM: '#4fc7b9', EMERALD: '#52c788', DIAMOND: '#64dcdc',
    MASTER: '#b077e8', GRANDMASTER: '#e84057', CHALLENGER: '#f4c842',
  };
  const TIER_CSS = {
    IRON: 'iron', BRONZE: 'bronze', SILVER: 'silver', GOLD: 'gold',
    PLATINUM: 'platinum', EMERALD: 'emerald', DIAMOND: 'diamond',
    MASTER: 'master-plus', GRANDMASTER: 'master-plus', CHALLENGER: 'master-plus',
  };

  const lp    = player.lp || 0;
  const color = TIER_COLOR[tier] || 'var(--text)';
  const cls   = TIER_CSS[tier]   || 'iron';

  // ── Master / Grandmaster / Challenger ─────────────────────────────────────
  if (['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(tier)) {
    const gmCut  = (apexThresholds && apexThresholds.gm_cutoff)         || 300;
    const chCut  = (apexThresholds && apexThresholds.challenger_cutoff) || 700;
    // Cap fill at 100%; allow over-quota if player has more LP than ch threshold
    const fillPct = Math.min(100, chCut > 0 ? (lp / chCut) * 100 : 0);
    const gmPct   = chCut > 0 ? Math.min(100, (gmCut / chCut) * 100) : 50;

    const milestones = [
      { label: 'M',  sublp: '0 LP',                              pct: 0 },
      { label: 'GM', sublp: gmCut.toLocaleString('es-AR') + ' LP', pct: gmPct },
      { label: 'C',  sublp: chCut.toLocaleString('es-AR') + ' LP', pct: 100 },
    ];

    const ticksHtml = milestones.map(m => `
      <div class="tick-item" style="left:${m.pct.toFixed(1)}%">
        <span class="tick-name">${m.label}</span>
        <span class="tick-sublp">${m.sublp}</span>
      </div>`).join('');

    const dotsHtml = milestones.map(m =>
      `<div class="rank-bar-dot" style="left:${m.pct.toFixed(1)}%"></div>`
    ).join('');

    return `
      <div class="rank-bar-section tier-${cls}">
        <div class="rank-bar-header">
          <span class="rank-bar-tier-path">MASTER → CHALLENGER</span>
          <span class="rank-bar-cur-label" style="color:${color}">${lp.toLocaleString('es-AR')} LP</span>
        </div>
        <div class="rank-bar-wrap">
          <div class="rank-bar-ticks rank-bar-ticks-master">${ticksHtml}</div>
          <div class="rank-bar-track">
            <div class="rank-bar-fill" style="width:${fillPct.toFixed(1)}%"></div>
            ${dotsHtml}
          </div>
          <div class="rank-bar-lp-label" style="left:${Math.min(98, fillPct).toFixed(1)}%;color:${color}">${lp.toLocaleString('es-AR')} LP</div>
        </div>
      </div>`;
  }

  // ── Iron → Diamond (4-division tiers) ─────────────────────────────────────
  const div    = (player.division || 'IV').toUpperCase();
  const divIdx = { IV: 0, III: 1, II: 2, I: 3 }[div] || 0;
  const fillPct = Math.min(100, (divIdx * 100 + lp) / 400 * 100);

  const abbr   = TIER_ABBR[tier] || tier[0];
  const nt     = NEXT_TIER[tier] || 'MASTER';
  const ntAbbr = TIER_ABBR[nt]  || nt[0];
  const tierPath = `${tier} → ${ntAbbr}`;
  const curLabel = `${TIER_NAME[tier] || tier} ${div} · ${lp} LP`;

  const ticksHtml = ['IV', 'III', 'II', 'I'].map((d, i) => {
    const pct      = i * 25;
    const isActive = d === div;
    return `
      <div class="tick-item${isActive ? ' active' : ''}" style="left:${pct}%">
        <span class="tick-name">${abbr}${d}</span>
      </div>`;
  }).join('') + `
  <div class="tick-item" style="left:100%">
    <span class="tick-name">${ntAbbr}</span>
  </div>`;

  const dotsHtml = [0, 25, 50, 75, 100].map(pct =>
    `<div class="rank-bar-dot" style="left:${pct}%"></div>`
  ).join('');

  return `
    <div class="rank-bar-section tier-${cls}">
      <div class="rank-bar-header">
        <span class="rank-bar-tier-path">${tierPath}</span>
        <span class="rank-bar-cur-label" style="color:${color}">${curLabel}</span>
      </div>
      <div class="rank-bar-wrap">
        <div class="rank-bar-ticks">${ticksHtml}</div>
        <div class="rank-bar-track">
          <div class="rank-bar-fill" style="width:${fillPct.toFixed(1)}%"></div>
          ${dotsHtml}
        </div>
        <div class="rank-bar-lp-label" style="left:${Math.max(2, Math.min(97, fillPct)).toFixed(1)}%;color:${color}">${lp} LP</div>
      </div>
    </div>`;
}

// -- LP assignment per match --
// Priority 1: confirmed from bracketing lp_history snapshots.
// Priority 2: estimated from daily delta using a sign-safe formula.
function assignMatchLP(dayMatches, hist, dailyDelta) {
  // Step 1 — try snapshot confirmation per match
  const result = dayMatches.map(m => {
    const matchEndMs    = m.timestamp;
    const AFTER_WINDOW  = 120 * 60 * 1000;  // 2 h after game end
    const BEFORE_WINDOW = 240 * 60 * 1000;  // 4 h before game start

    const after = hist
      .filter(h => {
        const t = new Date(h.timestamp).getTime();
        return t >= matchEndMs && t <= matchEndMs + AFTER_WINDOW;
      })
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))[0];

    const before = hist
      .filter(h => {
        const t = new Date(h.timestamp).getTime();
        return t < matchEndMs && t >= matchEndMs - BEFORE_WINDOW;
      })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

    let lp_change = null;
    if (after && before) {
      const delta = Math.round(after.total_lp - before.total_lp);
      if (delta >= -35 && delta <= 55) lp_change = delta;
    }
    return { ...m, lp_change, lp_estimated: false };
  });

  // Step 2 — distribute daily delta for unresolved matches
  const unknown = result.filter(m => m.lp_change === null);
  if (unknown.length > 0 && dailyDelta !== null) {
    const knownSum  = result.filter(m => m.lp_change !== null).reduce((s, m) => s + m.lp_change, 0);
    const remaining = Math.round(dailyDelta - knownSum);
    const wins      = unknown.filter(m =>  m.win).length;
    const losses    = unknown.filter(m => !m.win).length;

    // Sign-safe formula:
    //   wins * gainPerWin − losses * lossPerLoss = remaining
    // Fix gainPerWin ≈ 20 LP and derive lossPerLoss, or vice-versa.
    const BASE = 20;
    let gainPerWin, lossPerLoss;

    if (wins === 0) {
      gainPerWin  = BASE;
      lossPerLoss = losses > 0 ? Math.round(-remaining / losses) : BASE;
    } else if (losses === 0) {
      gainPerWin  = Math.round(remaining / wins);
      lossPerLoss = BASE;
    } else {
      gainPerWin  = BASE;
      lossPerLoss = Math.round((wins * BASE - remaining) / losses);
    }

    gainPerWin  = Math.max(12, Math.min(40, gainPerWin));
    lossPerLoss = Math.max(10, Math.min(45, lossPerLoss));

    for (const m of unknown) {
      m.lp_change   = m.win ? gainPerWin : -lossPerLoss;
      m.lp_estimated = true;
    }
  }

  return result;
}

function buildMatchRow(m) {
  const winCls      = m.win ? 'win' : 'loss';
  const resultLabel = m.win ? 'Victoria' : 'Derrota';

  // LP badge under champ image
  let lpHtml = '';
  if (m.lp_change !== null && m.lp_change !== undefined) {
    const lpCls  = m.lp_change > 0 ? 'pos' : m.lp_change < 0 ? 'neg' : 'zero';
    const lpSign = m.lp_change > 0 ? '+' : '';
    lpHtml = `<div class="match-lp-badge ${lpCls}">${lpSign}${m.lp_change} LP</div>`;
  }

  const kdaHtml = `<span>${m.kills}</span>/<span class="deaths">${m.deaths}</span>/<span>${m.assists}</span>`;

  const itemsHtml = (m.items || []).slice(0, 6).map(url =>
    url ? `<img class="match-item-img" src="${url}" alt="">`
        : `<div class="match-item-empty"></div>`
  ).join('');

  return `
    <div class="match-row ${winCls}">
      <div class="match-champ-col">
        <img class="match-champ-img" src="${m.champion_img}" alt="${escHtml(m.champion)}"
             onerror="this.src='https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/-1.png'">
        ${lpHtml}
      </div>
      <div class="match-result ${winCls}">${resultLabel}</div>
      <div class="match-kda">${kdaHtml}</div>
      <div class="match-items">${itemsHtml}</div>
      <div class="match-meta">
        <div class="match-cs">${m.cs} CS · ${m.cs_min}/min</div>
        <div class="match-time">${m.duration}</div>
      </div>
    </div>`;
}

function buildMatchList(matches, lpHistory) {
  if (!matches || !matches.length) {
    return `<div class="matches-title">PARTIDAS RECIENTES</div>
            <div class="no-matches">No hay partidas rankeadas recientes.</div>`;
  }

  const hist = lpHistory || [];

  // Sort newest first
  const sorted = [...matches].sort((a, b) => b.timestamp - a.timestamp);

  // Group by calendar day
  const dayMap = new Map();
  for (const m of sorted) {
    const dt = m.timestamp ? new Date(m.timestamp) : new Date();
    const dayKey = dt.toLocaleDateString('es-AR', { year: 'numeric', month: '2-digit', day: '2-digit' });
    if (!dayMap.has(dayKey)) dayMap.set(dayKey, { date: dt, matches: [] });
    dayMap.get(dayKey).matches.push(m);
  }

  let html = '<div class="matches-title">PARTIDAS RECIENTES</div><div class="matches-by-day">';

  for (const [, { date, matches: dayMatches }] of dayMap) {
    // Find lp_history entries for this calendar day
    const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
    const dayEnd   = new Date(date); dayEnd.setHours(23, 59, 59, 999);

    const daySnaps = hist
      .filter(h => {
        const t = new Date(h.timestamp).getTime();
        return t >= dayStart.getTime() && t <= dayEnd.getTime();
      })
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    let dailyDelta = null;
    if (daySnaps.length >= 2) {
      dailyDelta = daySnaps[daySnaps.length - 1].total_lp - daySnaps[0].total_lp;
    } else if (daySnaps.length === 1) {
      const prev = hist
        .filter(h => new Date(h.timestamp).getTime() < dayStart.getTime())
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
      if (prev) dailyDelta = daySnaps[0].total_lp - prev.total_lp;
    }

    // Assign per-match LP (confirmed first, then estimated from daily delta)
    const matchesWithLP = assignMatchLP(dayMatches, hist, dailyDelta);

    // Day header label
    const dayLabel = date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    const capitalized = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);

    let deltaHtml = '';
    if (dailyDelta !== null) {
      const cls  = dailyDelta > 0 ? 'pos' : dailyDelta < 0 ? 'neg' : 'zero';
      const sign = dailyDelta > 0 ? '+' : '';
      deltaHtml = `<span class="day-lp-delta ${cls}">${sign}${dailyDelta} LP</span>`;
    }

    html += `
      <div class="day-group">
        <div class="day-group-header">
          <span class="day-label">${escHtml(capitalized)}</span>
          ${deltaHtml}
        </div>
        <div class="matches-list">
          ${matchesWithLP.map(m => buildMatchRow(m)).join('')}
        </div>
      </div>`;
  }

  html += '</div>';
  return html;
}

// -- Select player --
window.selectPlayer = function(idx) {
  if (!state.data || !state.data.players) return;
  state.activePlayer = idx;
  renderTabs(state.data.players);
  renderCard(state.data.players[idx]);

  // Highlight table row
  document.querySelectorAll('#ranking-tbody tr').forEach((tr, i) => {
    tr.classList.toggle('active-row', i === idx);
  });
};

// -- Escape HTML --
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// -- Time update --
function refreshTimestamp() {
  if (state.data && state.data.last_updated) {
    $updateTime.textContent = timeAgo(state.data.last_updated);
  }
}

// -- Poll while loading --
function startPoll() {
  if (state.pollId) return;
  state.pollId = setInterval(async () => {
    const st = await fetchStatus();
    if (!st.loading) {
      clearInterval(state.pollId);
      state.pollId = null;
      await loadAndRender();
    }
  }, 4000);
}

function stopPoll() {
  clearInterval(state.pollId);
  state.pollId = null;
}

// -- API calls --
async function fetchData() {
  const r = await fetch('/api/data');
  if (r.status === 202) { return { loading: true }; }
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

async function fetchStatus() {
  try { return await (await fetch('/api/status')).json(); } catch { return {}; }
}

async function triggerRefresh() {
  try { await fetch('/api/refresh', { method: 'POST' }); } catch {}
}

// -- Full render --
function renderAll(data) {
  state.data = data;
  updateSiteTabLinks();
  renderTable(data.players);
  renderChart(data.lp_history, data.players, data.last_updated);
  renderTabs(data.players);
  renderCard(data.players[state.activePlayer] || data.players[0]);
  refreshTimestamp();
}

// -- Main load --
async function loadAndRender() {
  hide($errBanner);

  try {
    const st = await fetchStatus();

    if (!st.api_key_set) {
      hide($overlay);
      show($noKeyBanner);
      return;
    }

    // Has data (cached or fresh) — show immediately, poll silently if still refreshing
    if (st.has_data) {
      const data = await fetchData();
      if (data && data.players) {
        hide($overlay);
        show($app);
        renderAll(data);
      }
      if (st.loading && !state.pollId) {
        state.pollId = setInterval(async () => {
          const st2 = await fetchStatus();
          if (!st2.loading) {
            clearInterval(state.pollId);
            state.pollId = null;
            const fresh = await fetchData();
            if (fresh && fresh.players) renderAll(fresh);
          }
        }, 5000);
      }
      return;
    }

    // No data at all — first ever load, show overlay
    document.getElementById('loading-msg').textContent = 'Cargando datos por primera vez...';
    show($overlay);
    startPoll();

  } catch (e) {
    hide($overlay);
    $errText.textContent = 'Error al conectar con el servidor: ' + e.message;
    show($errBanner);
  }
}

// -- Toast helpers --
function showToast(msg) {
  if ($refreshToastMsg) $refreshToastMsg.textContent = msg || 'Actualizando datos...';
  show($refreshToast);
}
function hideToast() {
  hide($refreshToast);
}

// -- Refresh button --
$refreshBtn.addEventListener('click', async () => {
  $refreshBtn.classList.add('spinning');
  $refreshBtn.disabled = true;
  await triggerRefresh();
  hide($errBanner);

  if (state.data) {
    // Already have data — refresh silently in background, no overlay
    showToast('Actualizando datos...');
    if (state.pollId) return;
    state.pollId = setInterval(async () => {
      const st = await fetchStatus();
      if (!st.loading) {
        clearInterval(state.pollId);
        state.pollId = null;
        const fresh = await fetchData();
        if (fresh && fresh.players) renderAll(fresh);
        hideToast();
        $refreshBtn.classList.remove('spinning');
        $refreshBtn.disabled = false;
      }
    }, 4000);
  } else {
    // No data yet — show full overlay
    show($overlay);
    startPoll();
    setTimeout(() => {
      $refreshBtn.classList.remove('spinning');
      $refreshBtn.disabled = false;
    }, 2000);
  }
});

// -- Keep timestamp fresh --
setInterval(refreshTimestamp, 30000);

// -- Boot --
loadAndRender();