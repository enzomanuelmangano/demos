import numpy as np
from patches import load
from model import STYLES, color
# The step pattern in device pixels (3x), one channel.
def step_scene():
    a=np.zeros((2736,1260))
    a[:,630:]=1
    a[900:1020,:630]=1
    a[330:450,180:630]=1
    a[2250:2370,630:1080]=0
    return a
EFF=(180,450,1080,2250)  # x0 y0 x1 y1 px
def box_down(img, s, align='topleft'):
    """area-average onto a grid of pitch 1/s device px starting at the region's corner"""
    H,W=img.shape; p=1/s
    nw=int(np.ceil(W*s-1e-6)); nh=int(np.ceil(H*s-1e-6))
    def axis(n,N):
        M=np.zeros((n,N))
        for i in range(n):
            a,b=i*p,min((i+1)*p,N)
            for x in range(int(np.floor(a)),int(np.ceil(b))):
                M[i,x]=max(0,min(b,x+1)-max(a,x))
            M[i]/=M[i].sum()
        return M
    My=axis(nh,H); Mx=axis(nw,W)
    return My@img@Mx.T
def gauss1d(img, sigma, axis, normalize=True):
    if sigma<=0: return img
    r=int(np.ceil(3*sigma)); x=np.arange(-r,r+1); k=np.exp(-0.5*(x/sigma)**2); k/=k.sum()
    def conv(a):
        a=np.moveaxis(a,axis,-1); n=a.shape[-1]
        pad=np.zeros(a.shape[:-1]+(n+2*r,)); pad[...,r:r+n]=a
        out=np.zeros_like(a)
        for i,w in enumerate(k): out+=w*pad[...,i:i+n]
        return np.moveaxis(out,-1,axis)
    o=conv(img)
    if normalize: o=o/conv(np.ones_like(img))
    return o
def up_bilinear(low, s, H, W):
    p=1/s
    ys=(np.arange(H)+0.5)/p-0.5; xs=(np.arange(W)+0.5)/p-0.5
    def interp(n,coords):
        c=np.clip(coords,0,n-1); i0=np.floor(c).astype(int); i1=np.minimum(i0+1,n-1); t=c-i0
        return i0,i1,t
    y0,y1,ty=interp(low.shape[0],ys); x0,x1,tx=interp(low.shape[1],xs)
    a=low[y0][:,x0]*(1-tx)+low[y0][:,x1]*tx
    b=low[y1][:,x0]*(1-tx)+low[y1][:,x1]*tx
    return a*(1-ty)[:,None]+b*ty[:,None]
def backdrop(scene, style, f, eff=EFF, sigma_k=1.0, screen=3):
    st=STYLES[style]
    x0,y0,x1,y1=eff
    reg=scene[y0:y1,x0:x1]
    s=1+(st['scale']-1)*f
    r=st['radius']*f
    low=box_down(reg,s)
    sig=r*screen*s*sigma_k
    low=gauss1d(gauss1d(low,sig,1),sig,0)
    up=up_bilinear(low,s,*reg.shape)
    return up
def grey_out(v, style, f, order):
    # v: blurred (or not) grey 0..1; returns colour model on greys
    return color(np.stack([v,v,v],-1), style, f, 'grey')[...,0]
def simulate(style, f, **kw):
    sc=step_scene()
    st=STYLES[style]
    if st['curve']:  # colour ops before the blur
        pre=grey_out(sc,style,f,0)
        return backdrop(pre,style,f,**kw)
    b=backdrop(sc,style,f,**kw)
    return grey_out(b,style,f,0)
def capture(style,f):
    a=load(f'step-{style}-{f}')[:,:,0]/255
    x0,y0,x1,y1=EFF
    return a[y0:y1,x0:x1]
