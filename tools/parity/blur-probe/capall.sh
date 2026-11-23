#!/bin/sh
# Every capture the fit uses, into /tmp/blur-probe/cap.
cd "$(dirname "$0")"
C=/tmp/blur-probe/cap; mkdir -p $C
GREYS=$(python3 -c "print(';'.join(f'{v},{v},{v}' for v in [round(i*255/23) for i in range(24)]))")
./cap.sh $C/colors-none.png -style none -pattern patches -space srgb
./cap.sh $C/greys-none.png -style none -pattern patches -colors "$GREYS"
for s in regular systemMaterialDark systemUltraThinMaterialLight; do
  for f in 0.01 0.2 0.4 0.65 0.7 1.0; do
    ./cap.sh $C/colors-$s-$f.png -style $s -fraction $f -pattern patches -space srgb
    ./cap.sh $C/greys-$s-$f.png -style $s -fraction $f -pattern patches -colors "$GREYS"
    ./cap.sh $C/step-$s-$f.png -style $s -fraction $f -pattern step
  done
done
echo done
