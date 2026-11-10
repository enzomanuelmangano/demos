# Writes the probe captures the skia crate's backdrop tests compare against:
#   step.bin: per style (regular, systemMaterialDark, systemUltraThinMaterialLight) and fraction
#   (0.01, 0.2, 0.4, 0.65, 0.7, 1.0), the effect region's (180..1080 × 450..2250 px) red channel
#   on rows 510 and 1000 (900 bytes each) and columns 200 and 700 (1800 bytes each).
#   patches.txt: per capture the 24 patch centres (7 × 7 px means), and the inputs.
import sys, numpy as np
from patches import patches, load
OUT=sys.argv[1]
ST=['regular','systemMaterialDark','systemUltraThinMaterialLight']; FR=['0.01','0.2','0.4','0.65','0.7','1.0']
b=bytearray()
for s in ST:
  for f in FR:
    a=load(f'step-{s}-{f}')[450:2250,180:1080,0].astype(np.uint8)
    for part in (a[510],a[1000],a[:,200],a[:,700]): b+=part.tobytes()
open(OUT+'/step.bin','wb').write(b)
with open(OUT+'/patches.txt','w') as o:
  o.write('# kind style fraction: 24 r,g,b patch means (0..255), from the iOS 27.0 simulator\n')
  for k in ['colors','greys']:
    o.write(f'{k} none 0: '+' '.join(','.join(f'{v:.1f}' for v in p) for p in patches(f'{k}-none'))+'\n')
    for s in ST:
      for f in FR:
        o.write(f'{k} {s} {f}: '+' '.join(','.join(f'{v:.1f}' for v in p) for p in patches(f'{k}-{s}-{f}'))+'\n')
print(len(b))
