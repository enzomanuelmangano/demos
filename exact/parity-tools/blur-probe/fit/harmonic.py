import math
def roll(seed,k,n):
    turn=lambda x:(x%65536)*32768+math.floor(x/65536)
    stir=lambda x:turn((x*(16807+math.floor(x/65536)))%2147483647)
    return math.floor(stir(stir(stir(1+(stir(stir(1+seed%2147483646))+k)%2147483646)))*n/2147483647)
def hsl(h,s,l):
    c=(1-abs(2*l/100-1))*s/100; x=c*(1-abs((h/60)%2-1))
    r,g,b=[(c,x,0),(x,c,0),(0,c,x),(0,x,c),(x,0,c),(c,0,x)][min(int(h//60),5)]
    m=l/100-c/2
    return ''.join('%02X'%max(0,min(255,round(255*(m+v)))) for v in (r,g,b))
def harmonic(seed,k):
    hue=roll(seed,k*3,36000)/100; sat=70+roll(seed,k*3+1,1000)/1000; light=40+roll(seed,k*3+2,2000)/100
    return [hsl((hue+d)%360,sat,light) for d in (0,30,60)]
if __name__=='__main__':
    import sys
    seed=float(sys.argv[1]); y0=float(sys.argv[2])
    print(';'.join([str(y0)]+[','.join(harmonic(seed,k)) for k in range(100)]))
