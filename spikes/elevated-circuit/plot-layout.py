"""Plot actual sampled geometry. Run after run.ts; requires matplotlib."""
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, Rectangle

r = json.loads(Path('artifacts/elevated-circuit/layout.json').read_text())
p = r['samples']; start, end = r['wireStart'], r['wireEnd']
tunnel_start = next(i for i in range(end + 1, len(p)) if p[i]['z'] > -.6)
tunnel_end = next(i for i in range(tunnel_start + 1, len(p)) if p[i]['s'] >= p[tunnel_start]['s'] + 2.4)
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 11, 'svg.fonttype': 'none', 'svg.hashsalt': 'orbit-elevated-route-v1', 'text.color': '#e6eef8', 'axes.labelcolor': '#b9cadd', 'xtick.color': '#9eb3cc', 'ytick.color': '#9eb3cc', 'axes.edgecolor': '#35485e'})
fig = plt.figure(figsize=(12, 8), facecolor='#07111e')
fig.suptitle('ORBIT / ELEVATED CIRCUIT', x=.06, y=.96, ha='left', fontsize=21, fontweight='bold')
fig.text(.06, .915, 'Measured candidate geometry · coordinates remain open to playtesting', color='#9db5d1', fontsize=11)
ax = fig.add_axes([.06, .09, .42, .78], facecolor='#0e1c2d')
ax.add_patch(Rectangle((-6, -11), 12, 22, facecolor='#101f31', edgecolor='#60728b', linewidth=1.4))
for rail in r['rails']: ax.plot([rail['ax'],rail['bx']], [rail['az'],rail['bz']], color='#71839a', linewidth=2)
for b in r['bumpers']: ax.add_patch(Circle((b['x'],b['z']), b['radius'], facecolor='#283f57', edgecolor='#adbacd'))
for f in r['flippers']:
 import math
 ax.plot([f['x'], f['x']+f['side']*3*math.cos(f['rest'])], [f['z'], f['z']-f['side']*3*math.sin(f['rest'])], linewidth=5, color='#cbd7e5', solid_capstyle='round')
segments = [(0,start,'#ffb56c','Ascending ramp'),(start,end,'#6ee6f6','Open wire bridge'),(end,tunnel_start,'#ffb56c','Descent'),(tunnel_start,tunnel_end,'#ae93ff','Lit tunnel'),(tunnel_end,len(p)-1,'#ffb56c','Right return')]
for a,b,color,label in segments: ax.plot([v['x'] for v in p[a:b+1]], [v['z'] for v in p[a:b+1]], color=color, linewidth=5, solid_capstyle='round')
for text,i,xy in [('Entry / flared mouth',0,(1.0,3.1)),('Wire bridge',(start+end)//2,(-4.7,-8.7)),('Lit tunnel',tunnel_start,(-4.5,.5)),('Right return',len(p)-3,(-5.0,9.4))]:
 ax.annotate(text,(p[i]['x'],p[i]['z']),xytext=xy,color='#ecf2fb',fontsize=9,arrowprops={'arrowstyle':'-','color':'#a7bacf','linewidth':.9})
ax.scatter([-2.3],[6.8],s=30,color='#ffffff',zorder=10)
ax.set(xlim=(-6.7,6.7),ylim=(11.5,-11.5),aspect='equal',xlabel='X / board units',ylabel='Z / negative points up-table')
ax.set_title('TOP VIEW',loc='left',fontsize=11,color='#76dfef',pad=10)
ax.grid(color='#243448',linewidth=.5,alpha=.6)
profile = fig.add_axes([.55,.57,.39,.29],facecolor='#0e1c2d')
for a,b,color,label in segments: profile.plot([v['s'] for v in p[a:b+1]],[v['y'] for v in p[a:b+1]],color=color,linewidth=3)
profile.axhline(.28,color='#73859d',ls='--',lw=.8)
profile.set(xlim=(0,p[-1]['s']),ylim=(0,3.1),xlabel='Distance along route / board units',ylabel='Ball-centre height')
profile.set_title('HEIGHT PROFILE',loc='left',fontsize=11,color='#76dfef',pad=10);profile.grid(color='#243448',linewidth=.5)
peak=max(v['y'] for v in p)
fig.text(.55,.48,f'Length {p[-1]["s"]:.2f} · peak centre height {peak:.2f}',fontsize=14,fontweight='bold')
fig.text(.55,.39,'One repeatable shot objective\nLeft ramp → bridge → tunnel → right flipper',fontsize=12,linespacing=1.8)
fig.text(.55,.28,'Physics and visuals share the same sampled path.\nBall remains free: no teleport or spline attachment.\nWire deck stays open above the existing bumpers.',fontsize=11,color='#a7bbd3',linespacing=1.8)
fig.text(.55,.11,'Design spike, not release approval.\nEntry margins, camera sight lines, support collisions\nand hardware performance still need validation.',fontsize=10,color='#ffcb8e',linespacing=1.6)
Path('docs/assets').mkdir(parents=True,exist_ok=True)
svg = Path('docs/assets/elevated-circuit-layout.svg')
fig.savefig(svg,facecolor=fig.get_facecolor(),metadata={'Date': None})
svg.write_text('\n'.join(line.rstrip() for line in svg.read_text().splitlines()) + '\n')
fig.savefig('artifacts/elevated-circuit/layout.png',dpi=140,facecolor=fig.get_facecolor())
print('Saved docs/assets/elevated-circuit-layout.svg')
