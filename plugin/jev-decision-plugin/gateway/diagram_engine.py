"""Private Diagram MCP renderer, imported by the GitHub OAuth owner-gated JEV gateway.

Stateless SVG/HTML layout; no external I/O, no source persistence.
Copied from khs0927/minis-mcp-servers feat/diagram-design-mobile-mcp.
"""
from html import escape
from collections import defaultdict, deque
from xml.etree import ElementTree as ET
import re

def render(title: str, nodes: list[dict], edges: list[dict], direction: str="LR", subtitle: str="") -> dict:
    if not isinstance(title,str) or not 1 <= len(title) <= 120: raise ValueError("title length must be 1..120")
    if not 1 <= len(nodes) <= 24 or len(edges) > 48: raise ValueError("limits: 1..24 nodes and <=48 edges")
    if direction not in ("LR","TB"): raise ValueError("direction LR or TB only")
    ids=[n.get("id") for n in nodes]
    if any(not isinstance(i,str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,70}",i) for i in ids) or len(set(ids))!=len(ids): raise ValueError("unique ASCII node ids required")
    names={n["id"]: str(n.get("label",n["id"]))[:90] for n in nodes}
    links=[];incoming=defaultdict(int);outs=defaultdict(list)
    for e in edges:
        a,b=e.get("from"),e.get("to")
        if a not in names or b not in names or a==b: raise ValueError("invalid edge")
        incoming[b]+=1;outs[a].append(b)
        links.append((a,b,str(e.get("label",""))[:45]))
    layers={i:0 for i in ids};deg=dict(incoming);q=deque(i for i in ids if not deg.get(i,0));seen=0
    while q:
        cur=q.popleft();seen+=1
        for nxt in outs[cur]:
            layers[nxt]=max(layers[nxt],layers[cur]+1)
            deg[nxt]-=1
            if deg[nxt]==0:q.append(nxt)
    if seen != len(ids): layers={i:n//4 for n,i in enumerate(ids)}
    groups=defaultdict(list)
    for i in ids:groups[layers[i]].append(i)
    ncols=max(groups)+1;nrows=max(map(len,groups.values()))
    bw,bh,dx,dy=202,96,92,49
    width=(ncols if direction=="LR" else nrows)*(bw+dx)+130
    height=(nrows if direction=="LR" else ncols)*(bh+dy)+110
    pos={}
    for col, grp in groups.items():
        for row,i in enumerate(grp):
            if direction=="LR":
                x=64+col*(bw+dx);y=74+row*(bh+dy)+(nrows-len(grp))*(bh+dy)/2
            else:
                x=64+row*(bw+dx)+(nrows-len(grp))*(bw+dx)/2;y=74+col*(bh+dy)
            pos[i]=(int(x),int(y))
    svg=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" role="img" aria-labelledby="dd-title dd-desc">',
         '<title id="dd-title">'+escape(title)+'</title>',
         '<desc id="dd-desc">'+escape(subtitle[:200] or "Editable diagram")+'</desc>',
         '<defs><marker id="arr" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#2d3142"/></marker></defs>',
         '<rect width="100%" height="100%" fill="#f5f5f5"/>']
    for a,b,label in links:
        ax,ay=pos[a];bx,by=pos[b]
        if direction=="LR":
            x1,y1=ax+bw,ay+bh//2;x2,y2=bx,by+bh//2;mid=(x1+x2)//2
            path=f'M{x1} {y1} H{mid} V{y2} H{x2-9}'
            tx,ty=mid,(y1+y2)//2-8
        else:
            x1,y1=ax+bw//2,ay+bh;x2,y2=bx+bw//2,by;mid=(y1+y2)//2
            path=f'M{x1} {y1} V{mid} H{x2} V{y2-9}'
            tx,ty=(x1+x2)//2,mid-8
        svg.append(f'<path d="{path}" fill="none" stroke="#2d3142" stroke-width="1.7" marker-end="url(#arr)"/>')
        if label:svg.append(f'<text x="{tx}" y="{ty}" font-size="11" text-anchor="middle" fill="#596474">{escape(label)}</text>')
    for n in nodes:
        x,y=pos[n["id"]]; emph=n.get("emphasis") is True
        svg.append(f'<rect x="{x}" y="{y}" width="{bw}" height="{bh}" rx="6" fill="#ffffff" stroke="{"#bf4520" if emph else "#2d3142"}" stroke-width="{"2.2" if emph else "1.2"}"/>')
        label=names[n["id"]]
        # Character wrapping is robust for Korean and mixed scripts.
        lines=[label[i:i+18] for i in range(0,len(label),18)][:3]
        for j,txt in enumerate(lines):
            yy=y+bh/2+(j-(len(lines)-1)/2)*20+6
            svg.append(f'<text x="{x+bw/2}" y="{yy:.1f}" font-size="16" text-anchor="middle" fill="#2d3142" font-family="system-ui,Apple SD Gothic Neo,Noto Sans KR,sans-serif">{escape(txt)}</text>')
    svg.append('</svg>');markup=''.join(svg)
    ET.fromstring(markup)
    html='<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(title)+'</title><style>body{font-family:system-ui,-apple-system,sans-serif;background:#f5f5f5;margin:20px;color:#2d3142}.svg{max-width:100%;overflow:auto}svg{display:block}</style><h1>'+escape(title)+'</h1><p>'+escape(subtitle[:200])+'</p><div class="svg">'+markup+'</div></html>'
    return {"svg":markup,"html":html,"width":width,"height":height,"nodes":len(nodes),"edges":len(edges),"engine":"Independent diagram-design-mobile renderer; not upstream's complete engine"}

def validate_svg(svg: str) -> dict:
    if not isinstance(svg,str) or len(svg)>200000:raise ValueError("SVG size limit exceeded")
    if re.search(r'<\s*(script|foreignObject|image|use)\b|\bon\w+\s*=|(?:href|src)\s*=|url\s*\(\s*(?!#)',svg,re.I):
        return {"valid":False,"error":"unsafe or externally referenced SVG content"}
    try:
        root=ET.fromstring(svg)
        return {"valid":root.tag.endswith("svg"),"viewBox":root.attrib.get("viewBox")}
    except ET.ParseError as e:return {"valid":False,"error":str(e)}
