#!/usr/bin/env python3
"""
Test the Cricbuzz squad parser logic directly (replicating /api/cricbuzz-squad/route.ts in Python).
This proves the HTML parser works WITHOUT Next.js / AI.
"""
import re
import sys
import json
import urllib.request

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36"

def fetch_html(url, timeout=15):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
    })
    return urllib.request.urlopen(req, timeout=timeout).read().decode("utf-8", errors="replace")

def strip_tags(s):
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"<!--.*?-->", " ", s, flags=re.DOTALL)
    s = s.replace("&nbsp;", " ").replace("&amp;", "&").replace("&#39;", "'").replace("&quot;", '"')
    s = re.sub(r"&#x([0-9a-f]+);", lambda m: chr(int(m.group(1), 16)), s, flags=re.I)
    s = re.sub(r"&#(\d+);", lambda m: chr(int(m.group(1))), s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def infer_role(role_str):
    r = (role_str or "").lower()
    if "keeper" in r or "wk" in r: return "WK"
    if "allrounder" in r or "all-rounder" in r or "all rounder" in r: return "AR"
    if "bowler" in r or "bowling" in r: return "BOWL"
    if "batter" in r or "batsman" in r or "batting" in r: return "BAT"
    return "UNK"

def title_case_slug(slug):
    return " ".join(w.capitalize() for w in slug.split("-"))

def parse_teams_from_slug(slug):
    parts = slug.split("-")
    if "vs" not in parts: return {"t1": "T1", "t2": "T2"}
    vs_idx = parts.index("vs")
    rest_start = next((i for i, p in enumerate(parts) if i > vs_idx + 1 and re.match(r"^(\d+(st|nd|rd|th)|match|test|odi|t20i?|final|semi|qualifier|eliminator|only|warm)$", p, re.I)), -1)
    t2_end = rest_start if rest_start > 0 else vs_idx + 2
    return {"t1": " ".join(parts[:vs_idx]).upper(), "t2": " ".join(parts[vs_idx+1:t2_end]).upper()}

def find_section(html, heading, end_headings):
    start_re = re.compile(rf"<h[1-4][^>]*>\s*{heading}\s*</h[1-4]>", re.I)
    m = start_re.search(html)
    if not m: return ""
    frm = m.end()
    ends = []
    for h in end_headings:
        mh = re.search(rf"<h[1-4][^>]*>\s*{h}\s*</h[1-4]>", html[frm:], re.I)
        if mh: ends.append(frm + mh.start())
    to = min(ends) if ends else len(html)
    return html[frm:to]

def split_team_columns(section):
    patterns = [
        r'<div\s+class="w-1/2"[^>]*>',
        r'<div\s+class="[^"]*cb-col[^"]*cb-col-50[^"]*"[^>]*>',
        r'<div\s+class="[^"]*col-50[^"]*"[^>]*>',
    ]
    for pat in patterns:
        starts = list(re.finditer(pat, section))
        if len(starts) >= 2:
            return section[starts[0].start():starts[1].start()], section[starts[1].start():]
    return None

def parse_players_from_cards(html, team, status):
    out = []
    for m in re.finditer(r'href="/profiles/(\d+)/([a-z0-9-]+)"[^>]*>([\s\S]*?)</a>', html):
        pid, slug, inner = m.group(1), m.group(2), m.group(3)
        spans = [strip_tags(s.group(1)) for s in re.finditer(r"<span[^>]*>([\s\S]*?)</span>", inner)]
        spans = [s for s in spans if s]
        title_match = re.search(r'title=["\']View Profile Of ([^"\']+)["\']', inner, re.I)
        title_name = title_match.group(1) if title_match else None
        name = next((s for s in spans if not re.match(r"^\([A-Z]+\)$", s) and re.search(r"[a-z]", s) and len(s) < 60), None) or title_name or title_case_slug(slug)
        role_match = re.search(r'text-cbTxtSec[^>]*>([\s\S]*?)</div>', inner, re.I)
        role_alt = re.search(r"\((WK)\)", inner, re.I)
        role = role_match.group(1) if role_match else (role_alt.group(1) if role_alt else "")
        role_clean = strip_tags(role)
        captain = bool(re.search(r"\(c\)", strip_tags(inner), re.I))
        wk = bool(re.search(r"\(wk\)", strip_tags(inner), re.I)) or bool(re.search(r"keeper|wk", role_clean, re.I))
        out.append({
            "id": pid, "name": strip_tags(name), "team": team,
            "role": role_clean, "roleShort": infer_role(role_clean),
            "playingStatus": status, "captain": captain, "wicketKeeper": wk,
        })
    return out

def raw_profile_scan(html, t1, t2):
    seen = {}
    pattern = re.compile(
        r'href="/profiles/(\d+)/([a-z0-9-]+)"[^>]*?(?:title=["\']View Profile Of ([^"\']+)["\'])?[^>]*>',
        re.I
    )
    for m in pattern.finditer(html):
        pid, slug, title = m.group(1), m.group(2), m.group(3)
        if pid in seen: continue
        name = strip_tags(title) if title else title_case_slug(slug)
        if not name or len(name) < 3 or re.match(r"^[A-Z]+$", name): continue
        seen[pid] = {"id": pid, "name": name, "team": "", "role": "", "roleShort": "UNK",
                     "playingStatus": "SQUAD", "captain": False, "wicketKeeper": False}
    all_p = list(seen.values())
    if not all_p: return []
    half = (len(all_p) + 1) // 2
    return [{**p, "team": t1 if i < half else t2} for i, p in enumerate(all_p)]

def parse_scorecard(html, t1, t2):
    out = []
    innings = list(re.finditer(r"<h\d[^>]*>\s*([A-Z][A-Za-z\s]+?)\s+\d+(?:st|nd|rd|th)?\s+Innings\s*</h\d>", html, re.I))
    if not innings: return []
    for i, inn in enumerate(innings):
        team_name = inn.group(1).strip()
        start = inn.end()
        end = innings[i+1].start() if i+1 < len(innings) else len(html)
        section = html[start:end]
        seen = set()
        for m in re.finditer(r'href="/profiles/(\d+)/([a-z0-9-]+)"[^>]*>([\s\S]*?)</a>', section):
            pid, slug = m.group(1), m.group(2)
            if pid in seen: continue
            seen.add(pid)
            title_match = re.search(r'title=["\']View Profile Of ([^"\']+)["\']', m.group(3), re.I)
            name = strip_tags(title_match.group(1)) if title_match else title_case_slug(slug)
            if not name or len(name) < 3: continue
            out.append({"id": pid, "name": name, "team": team_name.upper(),
                        "role": "", "roleShort": "UNK", "playingStatus": "XI",
                        "captain": False, "wicketKeeper": False})
    return out

def get_squad(cb_id, slug):
    teams = parse_teams_from_slug(slug)
    t1, t2 = teams["t1"], teams["t2"]
    urls = [
        f"https://www.cricbuzz.com/cricket-match-squads/{cb_id}/{slug}",
        f"https://www.cricbuzz.com/live-cricket-scores/{cb_id}/{slug}",
        f"https://www.cricbuzz.com/cricket-full-scorecard/{cb_id}/{slug}",
    ]
    last_html = ""
    last_err = ""
    for url in urls:
        print(f"  Trying: {url}")
        try:
            html = fetch_html(url)
            last_html = html
            print(f"    Fetched {len(html)} bytes")
        except Exception as e:
            print(f"    Fetch failed: {e}")
            last_err = str(e)
            continue

        # Strategy 1: Playing XI
        xi = find_section(html, "playing XI", ["bench", "squad", "support staff"])
        if xi:
            cols = split_team_columns(xi)
            players = []
            if cols:
                players = parse_players_from_cards(cols[0], t1, "XI") + parse_players_from_cards(cols[1], t2, "XI")
            if len(players) >= 11:
                seen = {}
                for p in players:
                    if p["id"] not in seen: seen[p["id"]] = p
                return {"status": "success", "players": list(seen.values()), "teams": teams, "source": "Playing XI section"}

        # Strategy 2: Squad section
        sq = find_section(html, "squad", ["bench", "support staff", "venue guide"])
        if sq:
            cols = split_team_columns(sq)
            players = []
            if cols:
                players = parse_players_from_cards(cols[0], t1, "PROBABLE_XI")[:15] + parse_players_from_cards(cols[1], t2, "PROBABLE_XI")[:15]
            if len(players) >= 11:
                seen = {}
                for p in players:
                    if p["id"] not in seen: seen[p["id"]] = p
                return {"status": "success", "players": list(seen.values()), "teams": teams, "source": "Squad section"}

        # Strategy 3: Scorecard
        sc = parse_scorecard(html, t1, t2)
        if len(sc) >= 11:
            seen = {}
            for p in sc:
                if p["id"] not in seen: seen[p["id"]] = p
            return {"status": "success", "players": list(seen.values()), "teams": teams, "source": "Scorecard"}

    # Strategy 4: Raw fallback
    if last_html:
        raw = raw_profile_scan(last_html, t1, t2)
        if len(raw) >= 11:
            return {"status": "success", "players": raw, "teams": teams, "source": "Raw /profiles/ scan"}

    return {"status": "fail", "players": [], "teams": teams, "error": last_err or "No lineup found"}

# ============ MAIN TEST ============
if __name__ == "__main__":
    # Step 1: Get a list of live/upcoming matches from Cricbuzz
    print("=== Step 1: Fetching Cricbuzz live matches page ===")
    try:
        html = fetch_html("https://www.cricbuzz.com/cricket-match/live-scores")
        print(f"  Fetched {len(html)} bytes")
    except Exception as e:
        print(f"  Failed: {e}")
        sys.exit(1)

    # Extract match URLs (replicating parseCricbuzzMatches from fetch-web/route.ts)
    matches = []
    seen_keys = set()
    for m in re.finditer(r'<a\b(?=[^>]*href="([^"]*\/live-cricket-scores\/[^"]+)")(?=[^>]*title="([^"]+)")[^>]*>', html):
        href, title = m.group(1), m.group(2)
        if not href.startswith("http"):
            href = "https://www.cricbuzz.com" + href
        title = re.sub(r"\s+Live\s+Cricket\s+Score\b", "", title, flags=re.I)
        title = re.sub(r"\s+Full\s+Scorecard\b", "", title, flags=re.I)
        title = re.sub(r"\s+Commentary\b", "", title, flags=re.I)
        title = re.sub(r"\s+", " ", title).strip()
        if not re.search(r"\s+vs\s+", title, re.I): continue
        if re.search(r"\b(won|complete|abandoned|no result|drawn)\b", title, re.I): continue
        key = re.search(r"live-cricket-scores/(\d+)", href)
        key = key.group(1) if key else title.lower()
        if key in seen_keys: continue
        seen_keys.add(key)
        matches.append({"name": title, "url": href})

    print(f"  Found {len(matches)} matches")
    if not matches:
        print("  No matches found — Cricbuzz may have changed HTML structure")
        sys.exit(1)

    # Step 2: Test the squad parser on the first 3 matches
    print()
    print("=== Step 2: Testing squad parser on first 3 matches ===")
    for i, m in enumerate(matches[:3]):
        print(f"\n--- Match {i+1}: {m['name']} ---")
        url_match = re.search(r"cricbuzz\.com/(?:live-cricket-scores|cricket-match-squads|cricket-full-scorecard)/(\d+)/([^/?#]+)", m["url"], re.I)
        if not url_match:
            print("  Could not parse match URL")
            continue
        cb_id, slug = url_match.group(1), url_match.group(2)
        print(f"  id={cb_id}, slug={slug}")
        result = get_squad(cb_id, slug)
        print(f"  Status: {result['status']}")
        print(f"  Source: {result.get('source', 'n/a')}")
        if result["status"] == "success":
            players = result["players"]
            print(f"  Players found: {len(players)}")
            for p in players[:15]:
                print(f"    {p['name']:<30} | team={p['team']:<5} | role={p.get('roleShort', '?'):<5} | status={p.get('playingStatus', '?')}")
            if len(players) > 15:
                print(f"    ... and {len(players) - 15} more")
        else:
            print(f"  Error: {result.get('error', 'unknown')}")

    print()
    print("=== Done ===")
