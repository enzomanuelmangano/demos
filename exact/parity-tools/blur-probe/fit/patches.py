from PIL import Image; import numpy as np, sys
C='/tmp/blur-probe/cap/'
def load(n): return np.asarray(Image.open(C+n+'.png').convert('RGB')).astype(float)
def patches(n):
    a=load(n); out=[]
    for i in range(24):
        cx=int(((i%4)*105+52.5)*3); cy=int(((i//4)*152+76)*3)
        out.append(a[cy-3:cy+4,cx-3:cx+4].reshape(-1,3).mean(0))
    return np.array(out)
if __name__=='__main__':
    n=sys.argv[1]
    base=patches(n.split('-')[0]+'-none'); p=patches(n)
    a=load(n)
    for i in range(24):
        cx=int(((i%4)*105+52.5)*3); cy=int(((i//4)*152+76)*3)
        # uniformity inside the effect: min/max over the effect rect inset 2 px
        x0=int(((i%4)*105+40)*3)+2; y0=int(((i//4)*152+50)*3)+2
        r=a[y0:y0+52*3-4, x0:x0+25*3-4]
        print(i, base[i].round(1), '->', p[i].round(2), 'range', (r.max((0,1))-r.min((0,1))).round(0))
