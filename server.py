"""
Soloq Challenge - Flask server
Live ranked data from Riot API (LAS region) for 4 friends.
"""

import os
from dotenv import load_dotenv
load_dotenv()
import json
import os
import threading
import time
from datetime import datetime
from urllib.parse import quote

import requests
from flask import Flask, jsonify, render_template
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

BASE_DIR        = os.path.dirname(os.path.abspath(__file__))
DATA_DIR        = os.path.join(BASE_DIR, 'data')
CACHE_FILE      = os.path.join(DATA_DIR, 'cache.json')
LP_HISTORY_FILE = os.path.join(DATA_DIR, 'lp_history.json')

PLATFORM = 'la2'
REGIONAL = 'americas'

PLAYERS = [
    {"gameName": "Capjan",           "tagLine": "LAS"},
    {"gameName": "La Bruixa Sniper", "tagLine": "GORDO"},
    {"gameName": "conejarosada",     "tagLine": "miau"},
    {"gameName": "juani",            "tagLine": "FAX"},
    {"gameName": "Mephısto",         "tagLine": "Teton"},
    {"gameName": "poposito27",       "tagLine": "LAS"},
    {"gameName": "Zeliøn",           "tagLine": "LAS"},
    {"gameName": "BAILA VINI BAILA", "tagLine": "RMFC"},
    {"gameName": "falskgud",         "tagLine": "LAS"},
    {"gameName": "Zhíwù",            "tagLine": "plant"},
    {"gameName": "Good Dodger", "tagLine": "Calvo"},
    {"gameName": "Ch1r0nel", "tagLine":"LAS"},
    {"gameName": "tengo pecas", "tagLine" : "rayos"},
    {"gameName": "LamineYamal","tagLine" : "ryan1"}
]

PLAYER_COLORS = [
    "#0a1ef9",  # Capjan        — green
    "#fffb00",  # La Bruixa     — blue
    "#f472b6",  # conejarosada  — pink
    "#0dff01",  # juani         — yellow
    "#fb923c",  # Mephisto      — orange
    "#a78bfa",  # Poposito      — violet
    "#34d399",  # Zelion        — emerald
    "#ffffff",  # Dante         — red
    "#f87171",  #Falsk
    "#02704a",  #Hans
    "#d9ff00",  #Fran
    "#BD830F",  #Chiro
    "#0393A3"   #Cele
]

_cache = {'data': None, 'loading': False, 'error': None}
_lock  = threading.Lock()


def get_api_key():
    key = os.environ.get("RIOT_API_KEY")
    print("DEBUG RIOT_API_KEY:", repr(key))
    return key.strip() if key else ""


def riot_get(url, params=None):
    r = requests.get(url, headers={'X-Riot-Token': get_api_key()},
                     params=params, timeout=10)
    r.raise_for_status()
    return r.json()


def get_account(game_name, tag_line):
    url = f'https://{REGIONAL}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{quote(game_name)}/{quote(tag_line)}'
    return riot_get(url)


def get_summoner(puuid):
    return riot_get(f'https://{PLATFORM}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/{puuid}')


def get_ranked_entries(puuid):
    # Riot removed encryptedSummonerId from summoner response — use PUUID endpoint instead
    return riot_get(f'https://{PLATFORM}.api.riotgames.com/lol/league/v4/entries/by-puuid/{puuid}')


def get_match_ids(puuid, count=10):
    return riot_get(f'https://{REGIONAL}.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids',
                    params={'type': 'ranked', 'queue': 420, 'count': count})


def get_match(match_id):
    return riot_get(f'https://{REGIONAL}.api.riotgames.com/lol/match/v5/matches/{match_id}')


TIER_BASE = {
    'IRON': 0, 'BRONZE': 400, 'SILVER': 800, 'GOLD': 1200,
    'PLATINUM': 1600, 'EMERALD': 2000, 'DIAMOND': 2400,
    'MASTER': 2800, 'GRANDMASTER': 2800, 'CHALLENGER': 2800,
}
DIVISION_OFFSET = {'IV': 0, 'III': 100, 'II': 200, 'I': 300}
TIER_DISPLAY = {
    'IRON': 'Hierro', 'BRONZE': 'Bronce', 'SILVER': 'Plata', 'GOLD': 'Oro',
    'PLATINUM': 'Platino', 'EMERALD': 'Esmeralda', 'DIAMOND': 'Diamante',
    'MASTER': 'Master', 'GRANDMASTER': 'Gran Master', 'CHALLENGER': 'Challenger',
    'UNRANKED': 'Sin Rankear',
}


def calc_total_lp(tier, division, lp):
    tier = (tier or 'UNRANKED').upper()
    base = TIER_BASE.get(tier, 0)
    if tier in ('MASTER', 'GRANDMASTER', 'CHALLENGER'):
        return base + (lp or 0)
    return base + DIVISION_OFFSET.get((division or 'IV').upper(), 0) + (lp or 0)


_dd_version  = None
_champ_by_id = None


def get_dd_version():
    global _dd_version
    if _dd_version:
        return _dd_version
    try:
        _dd_version = requests.get(
            'https://ddragon.leagueoflegends.com/api/versions.json', timeout=10
        ).json()[0]
    except Exception:
        _dd_version = '15.7.1'
    return _dd_version


def get_champ_by_id():
    global _champ_by_id
    if _champ_by_id:
        return _champ_by_id
    try:
        v = get_dd_version()
        data = requests.get(
            f'https://ddragon.leagueoflegends.com/cdn/{v}/data/en_US/champion.json', timeout=10
        ).json()
        _champ_by_id = {int(c['key']): cid for cid, c in data['data'].items()}
    except Exception:
        _champ_by_id = {}
    return _champ_by_id


def champ_img(key):
    return f'https://ddragon.leagueoflegends.com/cdn/{get_dd_version()}/img/champion/{key}.png'


def item_img(item_id):
    if not item_id:
        return None
    return f'https://ddragon.leagueoflegends.com/cdn/{get_dd_version()}/img/item/{item_id}.png'


def profile_icon(icon_id):
    return f'https://ddragon.leagueoflegends.com/cdn/{get_dd_version()}/img/profileicon/{icon_id}.png'


def process_match(match_data, puuid):
    try:
        info = match_data.get('info', {})
        player = next((p for p in info.get('participants', []) if p.get('puuid') == puuid), None)
        if not player:
            return None
        champ_map = get_champ_by_id()
        champ_key = champ_map.get(player.get('championId', 0)) or player.get('championName', '?')
        kills   = player.get('kills', 0)
        deaths  = player.get('deaths', 0)
        assists = player.get('assists', 0)
        items   = [item_img(player.get(f'item{i}', 0)) for i in range(7)]
        dur_s   = info.get('gameDuration', 0)
        total_cs = player.get('totalMinionsKilled', 0) + player.get('neutralMinionsKilled', 0)
        return {
            'champion':     champ_key,
            'champion_img': champ_img(champ_key),
            'win':          player.get('win', False),
            'kills': kills, 'deaths': deaths, 'assists': assists,
            'items':        items,
            'duration_s':   dur_s,
            'duration':     f'{dur_s // 60:02d}:{dur_s % 60:02d}',
            'cs':           total_cs,
            'cs_min':       round(total_cs / (dur_s / 60), 1) if dur_s > 0 else 0,
            'timestamp':    info.get('gameEndTimestamp', 0),
            'match_id':     match_data.get('metadata', {}).get('matchId', ''),
        }
    except Exception as e:
        print(f'[match] {e}')
        return None


def fetch_player(cfg, color):
    name, tag = cfg['gameName'], cfg['tagLine']
    result = {
        'name': name, 'tagLine': tag, 'riotId': f'{name}#{tag}', 'color': color,
        'opgg_url':  f"https://www.op.gg/summoners/las/{quote(name)}-{tag}",
        'ugg_url':   f"https://u.gg/lol/profile/las1/{quote(name.lower())}-{tag}/overview",
        'logs_url':  f"https://www.leagueofgraphs.com/summoner/las/{quote(name)}-{tag}",
        'tier': 'UNRANKED', 'division': '', 'lp': 0, 'total_lp': 0,
        'wins': 0, 'losses': 0, 'wr': 0, 'total_games': 0, 'rank_str': 'Sin Rankear',
        'error': None, 'matches': [], 'top_champs': [],
        'avg_kills': 0, 'avg_deaths': 0, 'avg_assists': 0,
        'kda': 0, 'avg_cs_min': 0, 'avg_duration': '00:00',
    }
    try:
        acc    = get_account(name, tag);          puuid = acc['puuid'];       time.sleep(1.2)
        summ   = get_summoner(puuid);                                          time.sleep(1.2)
        result['puuid']          = puuid
        result['profile_icon_id'] = summ.get('profileIconId', 29)
        result['profile_icon']   = profile_icon(summ.get('profileIconId', 29))
        result['level']          = summ.get('summonerLevel', 30)

        entries = get_ranked_entries(puuid);                                   time.sleep(1.2)
        solo = next((e for e in entries if e['queueType'] == 'RANKED_SOLO_5x5'), None)
        if solo:
            tier, div, lp = solo.get('tier', 'UNRANKED'), solo.get('rank', ''), solo.get('leaguePoints', 0)
            wins, losses  = solo.get('wins', 0), solo.get('losses', 0)
            tg = wins + losses
            result.update({
                'tier': tier, 'division': div, 'lp': lp,
                'total_lp': calc_total_lp(tier, div, lp),
                'wins': wins, 'losses': losses, 'total_games': tg,
                'wr': round(wins / tg * 100, 1) if tg else 0,
                'rank_str': (f"{TIER_DISPLAY.get(tier, tier)} {div} - {lp} LP"
                             if div and tier not in ('MASTER', 'GRANDMASTER', 'CHALLENGER')
                             else f"{TIER_DISPLAY.get(tier, tier)} - {lp} LP"),
            })

        match_ids  = get_match_ids(puuid, 10)
        matches    = []
        champ_agg  = {}
        for mid in match_ids[:10]:
            try:
                m = process_match(get_match(mid), puuid)
                if m:
                    matches.append(m)
                    ck = m['champion']
                    if ck not in champ_agg:
                        champ_agg[ck] = {'wins': 0, 'losses': 0, 'kills': 0, 'deaths': 0, 'assists': 0}
                    champ_agg[ck]['wins' if m['win'] else 'losses'] += 1
                    for s in ('kills', 'deaths', 'assists'):
                        champ_agg[ck][s] += m[s]
                time.sleep(0.8)
            except Exception as e:
                print(f'[match] {mid}: {e}')

        result['matches'] = matches

        top = []
        for ck, st in champ_agg.items():
            g  = st['wins'] + st['losses']
            d  = st['deaths'] or 1
            top.append({'champion': ck, 'champion_img': champ_img(ck),
                        'games': g, 'wr': round(st['wins'] / g * 100) if g else 0,
                        'kda': round((st['kills'] + st['assists']) / d, 2)})
        top.sort(key=lambda x: x['games'], reverse=True)
        result['top_champs'] = top[:5]

        if matches:
            n  = len(matches)
            tk = sum(m['kills'] for m in matches)
            td = sum(m['deaths'] for m in matches) or 1
            ta = sum(m['assists'] for m in matches)
            ts = sum(m['duration_s'] for m in matches)
            avg_s = ts // n
            result.update({
                'avg_kills': round(tk / n, 1), 'avg_deaths': round(td / n, 1),
                'avg_assists': round(ta / n, 1),
                'kda': round((tk + ta) / td, 2),
                'avg_cs_min': round(sum(m['cs'] for m in matches) / (ts / 60), 1) if ts else 0,
                'avg_duration': f'{avg_s // 60:02d}:{avg_s % 60:02d}',
            })
    except requests.exceptions.HTTPError as e:
        code = e.response.status_code if e.response is not None else '?'
        result['error'] = f'HTTP {code}'
        print(f'[player] {name}#{tag} HTTP {code}')
    except Exception as e:
        result['error'] = str(e)
        print(f'[player] {name}#{tag} error: {e}')
    return result


def save_lp_snapshot(players_data, daily=False):
    """Save LP snapshot to lp_history.json.
    
    If daily=True, always records the snapshot (one-per-day chart point).
    If daily=False (live polling), only updates the in-memory cache LP values
    but does NOT write to lp_history.json — keeps the chart to 1 point/day.
    """
    os.makedirs(DATA_DIR, exist_ok=True)
    history = {}
    if os.path.exists(LP_HISTORY_FILE):
        try:
            with open(LP_HISTORY_FILE) as f:
                history = json.load(f)
        except Exception:
            pass

    if daily:
        ts = datetime.now().isoformat()
        for p in players_data:
            key = p['riotId']
            today = datetime.now().strftime('%Y-%m-%d')
            existing = history.get(key, [])
            # Replace today's entry if it exists, otherwise append
            same_day = [e for e in existing if e.get('timestamp', '').startswith(today)]
            if same_day:
                # Update the existing entry for today
                for e in existing:
                    if e.get('timestamp', '').startswith(today):
                        e['total_lp']  = p.get('total_lp', 0)
                        e['tier']      = p.get('tier', 'UNRANKED')
                        e['division']  = p.get('division', '')
                        e['raw_lp']    = p.get('lp', 0)
                        e['timestamp'] = ts
            else:
                existing.append({
                    'timestamp': ts, 'total_lp': p.get('total_lp', 0),
                    'tier': p.get('tier', 'UNRANKED'), 'division': p.get('division', ''),
                    'raw_lp': p.get('lp', 0),
                })
            history[key] = existing[-200:]
        with open(LP_HISTORY_FILE, 'w') as f:
            json.dump(history, f, indent=2)
        print(f'[snapshot] Daily LP snapshot saved for {len(players_data)} players.')

    return history


def fetch_apex_thresholds():
    """Fetch GM and Challenger minimum LP thresholds for LAS RANKED_SOLO_5x5."""
    result = {'gm_cutoff': 300, 'challenger_cutoff': 700}
    try:
        gm = riot_get(
            f'https://{PLATFORM}.api.riotgames.com/lol/league/v4/grandmasterleagues/by-queue/RANKED_SOLO_5x5'
        )
        gm_lps = [e.get('leaguePoints', 0) for e in gm.get('entries', [])]
        if gm_lps:
            result['gm_cutoff'] = min(gm_lps)
        time.sleep(0.5)
        ch = riot_get(
            f'https://{PLATFORM}.api.riotgames.com/lol/league/v4/challengerleagues/by-queue/RANKED_SOLO_5x5'
        )
        ch_lps = [e.get('leaguePoints', 0) for e in ch.get('entries', [])]
        if ch_lps:
            result['challenger_cutoff'] = min(ch_lps)
        print(f'[apex] LAS thresholds — GM: {result["gm_cutoff"]} LP, Challenger: {result["challenger_cutoff"]} LP')
    except Exception as e:
        print(f'[apex] {e}')
    return result


def poll_lp_only(daily=False):
    """Lightweight LP-only poll: just ranked entries per player, no match data.
    
    If daily=True, also writes to lp_history.json (daily chart point).
    Otherwise only updates the live in-memory cache (table/rank bar), no chart write.
    """
    if not get_api_key():
        return
    tag_label = '[daily-snap]' if daily else '[lp-poll]'
    print(f'{tag_label} Polling LP...')
    updated = []
    for i, cfg in enumerate(PLAYERS):
        name, tag = cfg['gameName'], cfg['tagLine']
        try:
            acc = get_account(name, tag)
            puuid = acc['puuid']
            time.sleep(0.5)
            entries = get_ranked_entries(puuid)
            time.sleep(0.5)
            solo = next((e for e in entries if e['queueType'] == 'RANKED_SOLO_5x5'), None)
            if solo:
                tier     = solo.get('tier', 'UNRANKED')
                div      = solo.get('rank', '')
                lp       = solo.get('leaguePoints', 0)
                total_lp = calc_total_lp(tier, div, lp)
                updated.append({
                    'riotId': f'{name}#{tag}', 'tier': tier,
                    'division': div, 'lp': lp, 'total_lp': total_lp,
                })
                print(f'{tag_label}   {name}#{tag}: {tier} {div} {lp}LP')
        except Exception as e:
            print(f'{tag_label} {name}#{tag}: {e}')
        if i < len(PLAYERS) - 1:
            time.sleep(1.2)

    if updated:
        # Only write to lp_history.json when this is a daily snapshot
        history = save_lp_snapshot(updated, daily=daily)
        apex = fetch_apex_thresholds()
        with _lock:
            if _cache['data']:
                try:
                    if daily:
                        _cache['data']['lp_history'] = history
                    for p_data in (_cache['data'].get('players') or []):
                        match_upd = next((u for u in updated if u['riotId'] == p_data['riotId']), None)
                        if match_upd:
                            p_data.update({k: v for k, v in match_upd.items()
                                           if k in ('tier', 'division', 'lp', 'total_lp')})
                    _cache['data']['apex_thresholds'] = apex
                except Exception as e:
                    print(f'{tag_label} cache update error: {e}')
    print(f'{tag_label} Done, polled {len(updated)} players.')


def lp_poll_loop():
    """Run poll_lp_only every 2 minutes (live LP updates, no chart write)."""
    time.sleep(300)   # 5 min — let the full refresh finish first
    while True:
        try:
            if not _cache['loading']:
                poll_lp_only(daily=False)
        except Exception as e:
            print(f'[lp-poll] Loop error: {e}')
        time.sleep(120)  # 2 min


def daily_snapshot_loop():
    """At 23:55 every day, record one LP data point per player for the chart."""
    while True:
        now = datetime.now()
        # Calculate seconds until next 23:55:00
        target = now.replace(hour=23, minute=55, second=0, microsecond=0)
        if now >= target:
            # Already past 23:55 today — aim for tomorrow
            from datetime import timedelta
            target += timedelta(days=1)
        wait_s = (target - now).total_seconds()
        print(f'[daily-snap] Next snapshot at {target.strftime("%Y-%m-%d %H:%M")} '
              f'(in {int(wait_s // 3600)}h {int((wait_s % 3600) // 60)}m)')
        time.sleep(wait_s)
        try:
            print('[daily-snap] Taking daily LP snapshot...')
            poll_lp_only(daily=True)
        except Exception as e:
            print(f'[daily-snap] Error: {e}')


def refresh_all():
    with _lock:
        if _cache['loading']:
            return
        _cache['loading'] = True
    try:
        if not get_api_key():
            _cache['error'] = 'RIOT_API_KEY no configurada. Crea el archivo .env con RIOT_API_KEY=RGAPI-...'
            return
        print('[server] Refreshing player data...')
        players_data = []
        for i, cfg in enumerate(PLAYERS):
            print(f'[server]   {cfg["gameName"]}#{cfg["tagLine"]}')
            players_data.append(fetch_player(cfg, PLAYER_COLORS[i % len(PLAYER_COLORS)]))
            time.sleep(1.2)
        players_data.sort(key=lambda x: x.get('total_lp', 0), reverse=True)
        for i, p in enumerate(players_data):
            p['rank'] = i + 1
        lp_history = save_lp_snapshot(players_data, daily=True)
        apex = fetch_apex_thresholds()
        data = {
            'players': players_data, 'lp_history': lp_history,
            'apex_thresholds': apex,
            'last_updated': datetime.now().isoformat(), 'dd_version': get_dd_version(),
        }
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        _cache['data']  = data
        _cache['error'] = None
        print('[server] Refresh complete.')
    except Exception as e:
        print(f'[server] Refresh error: {e}')
        _cache['error'] = str(e)
    finally:
        _cache['loading'] = False


@app.route('/')
@app.route('/v2')
def index():
    from flask import make_response
    resp = make_response(render_template('index.html'))
    resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    resp.headers['Pragma'] = 'no-cache'
    return resp


@app.route('/api/data')
def api_data():
    if _cache['data']:
        d = dict(_cache['data'])
        d['loading'] = _cache['loading']
        d['error']   = _cache['error']
        return jsonify(d)
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
            _cache['data'] = data
            data['loading'] = _cache['loading']
            data['error']   = _cache['error']
            return jsonify(data)
        except Exception:
            pass
    if _cache['loading']:
        return jsonify({'loading': True, 'message': 'Cargando datos...'}), 202
    threading.Thread(target=refresh_all, daemon=True).start()
    return jsonify({'loading': True, 'message': 'Iniciando actualizacion...'}), 202


@app.route('/api/refresh', methods=['POST'])
def api_refresh():
    if _cache['loading']:
        return jsonify({'loading': True})
    threading.Thread(target=refresh_all, daemon=True).start()
    return jsonify({'loading': True})


@app.route('/api/status')
def api_status():
    return jsonify({
        'loading':     _cache['loading'],
        'error':       _cache['error'],
        'has_data':    _cache['data'] is not None,
        'api_key_set': bool(get_api_key()),
        'last_updated': (_cache['data'] or {}).get('last_updated'),
    })


if __name__ == '__main__':
    os.makedirs(DATA_DIR, exist_ok=True)
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                _cache['data'] = json.load(f)
            print('[server] Loaded cached data from disk')
        except Exception:
            pass
    if get_api_key():
        print('[server] API key found - starting background refresh...')
        threading.Thread(target=refresh_all, daemon=True).start()
        threading.Thread(target=lp_poll_loop, daemon=True).start()
        threading.Thread(target=daily_snapshot_loop, daemon=True).start()
    else:
        print('[server] WARNING: RIOT_API_KEY not set.')
        print('[server] Create a .env file: RIOT_API_KEY=RGAPI-xxxx')
    print(f"[server] Starting on port {os.environ.get('PORT', 8080)}")
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 8080)))