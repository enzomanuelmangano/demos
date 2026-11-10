from sim import *
def prof_model(st,f,k,phase=0.0):
    S=STYLES[st]; s=1+(S['scale']-1)*f; r=S['radius']*f
    row=np.zeros((1,900)); row[0,450:]=1
    if S['curve']: row=grey_out(row,st,f,0)
    low=box_down(row,s)
    low=gauss1d(low,r*3*s*k,1)
    up=up_bilinear(np.repeat(low,2,0),s,2,900)[0]
    if not S['curve']: up=grey_out(up,st,f,0)
    return up
def prof_cap(st,f):
    c=capture(st,f)
    return c[700:1100].mean(0)
