# Fit of UIKit's partially animated blur to the probe's captures (exact/parity-tools/blur-probe:
# build.sh, capall.sh write /tmp/blur-probe/cap). sim.py simulates the measured chain; prof.py fits σ.
import numpy as np
W709=np.array([0.2126,0.7152,0.0722])
STYLES={
 'regular': dict(radius=20, scale=0.125, sat=1.8, curve=None, bright=0, tint=(0.11,0.73)),
 'systemMaterialDark': dict(radius=29.5, scale=0.25, sat=1.5, curve=(0.75,(0.16,0.26,0.10,0.10)), bright=0, tint=None),
 'systemUltraThinMaterialLight': dict(radius=22.5, scale=0.25, sat=1.1, curve=(0.5,(0.45,0.55,0.65,0.68)), bright=0.12, tint=None),
}
def bez(v,t):
    u=1-t
    return u**3*v[0]+3*u*u*t*v[1]+3*u*t*t*v[2]+t**3*v[3]
def color(c, style, f, variant='shift', clampcurve=False, clampsat=True):
    st=STYLES[style]; c=np.array(c,float)
    if st['curve']:
        amt,v=st['curve']; amt*=f
        L=c@W709
        Lp=bez(v,np.clip(L,0,1))
        if variant=='shift': o=c+(Lp-L)[...,None]
        elif variant=='scale': o=c*(Lp/np.maximum(L,1e-6))[...,None]
        elif variant=='grey': o=np.repeat(Lp[...,None],3,-1)
        c=c+(o-c)*amt
        if clampcurve: c=np.clip(c,0,1)
    s=1+(st['sat']-1)*f
    M=(1-s)*np.outer(np.ones(3),W709)+s*np.eye(3)
    c=c@M.T
    if clampsat: c=np.clip(c,0,1)
    c=c+st['bright']*f
    c=np.clip(c,0,1)
    if st['tint']:
        g,a=st['tint']; a*=f
        c=c*(1-a)+g*a
    return c
