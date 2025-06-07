import { Skia } from '@shopify/react-native-skia';

// THIS SHADER COMES COURTESY OF P_Malin from ShaderToy
// SOURCE: https://www.shadertoy.com/view/MdlXWr
// TWITTER: https://twitter.com/P_Malin
// YOUTUBE: https://www.youtube.com/@paulmalin2116

// I was very inspired by Dan's video https://www.youtube.com/watch?v=Af2-OT9mE14
// and tried to update some effects to make it more consistent with the thing I was trying to build

export const shader = Skia.RuntimeEffect.Make(`
uniform vec2 iResolution;
uniform float iTime;

float fBrightness = 3.5;

// Number of angular segments
float fSteps = 121.0;

float fParticleSize = 0.005;
float fParticleLength = 0.5 / 60.0;

// Min and Max star position radius. Min must be present to prevent stars too near camera
float fMinDist = 0.8;
float fMaxDist = 5.0;

float fRepeatMin = 1.0;
float fRepeatMax = 2.0;

// fog density
float fDepthFade = 0.6;

float Random(float x)
{
	return fract(sin(x * 123.456) * 23.4567 + sin(x * 345.678) * 45.6789 + sin(x * 456.789) * 56.789);
}

// Enhanced random function for better color variation
vec3 RandomColor(float seed) {
    float r = Random(seed);
    float g = Random(seed + 1.23);
    float b = Random(seed + 2.34);
    
    // Create grayscale palette with different brightness levels
    float gray1 = 0.9; // Light gray
    float gray2 = 0.7; // Medium light gray
    float gray3 = 0.5; // Medium gray
    float gray4 = 0.3; // Medium dark gray
    float gray5 = 0.1; // Dark gray
    
    float selector = Random(seed + 3.45);
    
    if (selector < 0.2) return vec3(gray1);
    else if (selector < 0.4) return vec3(gray2);
    else if (selector < 0.6) return vec3(gray3);
    else if (selector < 0.8) return vec3(gray4);
    else return vec3(gray5);
}

// Twinkling effect
float Twinkle(float seed, float time) {
    float phase = Random(seed) * 6.28318;
    float freq = 0.5 + Random(seed + 0.5) * 2.0;
    return 0.7 + 0.3 * sin(time * freq + phase);
}

vec3 GetParticleColour( const in vec3 vParticlePos, const in float fParticleSize, const in vec3 vRayDir, const in float fSeed )
{		
	vec2 vNormDir = normalize(vRayDir.xy);
	float d1 = dot(vParticlePos.xy, vNormDir.xy) / length(vRayDir.xy);
	vec3 vClosest2d = vRayDir * d1;
	
	vec3 vClampedPos = vParticlePos;
	
	vClampedPos.z = clamp(vClosest2d.z, vParticlePos.z - fParticleLength, vParticlePos.z + fParticleLength);
	
	float d = dot(vClampedPos, vRayDir);
	
	vec3 vClosestPos = vRayDir * d;
	
	vec3 vDeltaPos = vClampedPos - vClosestPos;	
	
	// Variable particle size for magical effect
	float particleVariation = 0.5 + Random(fSeed + 10.0) * 1.5;
	float adjustedSize = fParticleSize * particleVariation;
		
	float fClosestDist = length(vDeltaPos) / adjustedSize;
	
	float fShade = 	clamp(1.0 - fClosestDist, 0.0, 1.0);
	
	// Add glow effect
	fShade = pow(fShade, 0.8);
	
	// Apply twinkling
	float twinkle = Twinkle(fSeed + 5.0, iTime);
	fShade = fShade * exp2(-d * fDepthFade) * fBrightness * twinkle;
	
	// Get magical color
	vec3 particleColor = RandomColor(fSeed);
	
	// Add some sparkle highlights
	float sparkle = 1.0;
	if (fShade > 0.8) {
	    sparkle = 1.0 + 2.0 * pow(fShade - 0.8, 2.0) * Twinkle(fSeed + 7.0, iTime * 3.0);
	}
	
	return particleColor * fShade * sparkle;
}

vec3 GetParticlePos( const in vec3 vRayDir, const in float fZPos, const in float fSeed )
{
	float fAngle = atan(vRayDir.x, vRayDir.y);
	float fAngleFraction = fract(fAngle / (3.14 * 2.0));
	
	float fSegment = floor(fAngleFraction * fSteps + fSeed) + 0.5 - fSeed;
	float fParticleAngle = fSegment / fSteps * (3.14 * 2.0);

	float fSegmentPos = fSegment / fSteps;
	float fRadius = fMinDist + Random(fSegmentPos + fSeed) * (fMaxDist - fMinDist);
	
	float tunnelZ = vRayDir.z / length(vRayDir.xy / fRadius);
	
	tunnelZ += fZPos;
	
	float fRepeat = fRepeatMin + Random(fSegmentPos + 0.1 + fSeed) * (fRepeatMax - fRepeatMin);
	
	float fParticleZ = (ceil(tunnelZ / fRepeat) - 0.5) * fRepeat - fZPos;
	
	return vec3( sin(fParticleAngle) * fRadius, cos(fParticleAngle) * fRadius, fParticleZ );
}

vec3 Starfield( const in vec3 vRayDir, const in float fZPos, const in float fSeed )
{	
	vec3 vParticlePos = GetParticlePos(vRayDir, fZPos, fSeed);
	
	return GetParticleColour(vParticlePos, fParticleSize, vRayDir, fSeed);	
}

vec3 RotateX( const in vec3 vPos, const in float fAngle )
{
    float s = sin(fAngle);
    float c = cos(fAngle);
    
    vec3 vResult = vec3( vPos.x, c * vPos.y + s * vPos.z, -s * vPos.y + c * vPos.z);
    
    return vResult;
}

vec3 RotateY( const in vec3 vPos, const in float fAngle )
{
    float s = sin(fAngle);
    float c = cos(fAngle);
    
    vec3 vResult = vec3( c * vPos.x + s * vPos.z, vPos.y, -s * vPos.x + c * vPos.z);
    
    return vResult;
}

vec3 RotateZ( const in vec3 vPos, const in float fAngle )
{
    float s = sin(fAngle);
    float c = cos(fAngle);
    
    vec3 vResult = vec3( c * vPos.x + s * vPos.y, -s * vPos.x + c * vPos.y, vPos.z);
    
    return vResult;
}

vec4 main( in vec2 fragCoord )
{
	vec2 vScreenUV = fragCoord.xy / iResolution.xy;
	
	vec2 vScreenPos = vScreenUV * 2.0 - 1.0;
	vScreenPos.x *= iResolution.x / iResolution.y;

	vec3 vRayDir = normalize(vec3(vScreenPos, 1.0));

	// More fluid, magical rotation - sped up
	vec3 vEuler = vec3(
	    0.3 + sin(iTime * 0.3) * 0.2, 
	    0.2 + sin(iTime * 0.16) * 0.3, 
	    iTime * 0.1 + sin(iTime * 0.24) * 0.8
	);
			
	vRayDir = RotateX(vRayDir, vEuler.x);
	vRayDir = RotateY(vRayDir, vEuler.y);
	vRayDir = RotateZ(vRayDir, vEuler.z);
	
	float fShade = 0.0;
		
	float a = 0.3;
	float b = 8.0;
	float c = 2.4;
	float fZPos = 5.0 + iTime * c + sin(iTime * a) * b;
	float fSpeed = c + a * b * cos(a * iTime);
	
	fParticleLength = 0.3 * fSpeed / 60.0;
	
	float fSeed = 0.0;
	
	// Black background
	vec3 bgColor1 = vec3(0.0);  // Black
	vec3 bgColor2 = vec3(0.0);  // Black
	vec3 bgColor3 = vec3(0.0);  // Black
	
	float bgMix1 = (sin(iTime * 0.2) + 1.0) * 0.5;
	float bgMix2 = (cos(iTime * 0.14) + 1.0) * 0.5;
	
	vec3 vResult = mix(mix(bgColor1, bgColor2, bgMix1), bgColor3, bgMix2);
	
	// Remove aurora effect since background is black
	// float aurora = sin(vScreenPos.x * 2.0 + iTime * 0.5) * sin(vScreenPos.y * 1.5 + iTime * 0.3);
	// vResult += vec3(0.01, 0.005, 0.02) * aurora * aurora;
	
	// Multiple layers for depth and richness
	for(int i=0; i<3; i++)
	{
		vResult += Starfield(vRayDir, fZPos, fSeed);
		fSeed += 1.234;
		fZPos += 2.0; // Offset layers
	}
	
	// Add some overall magical glow - sped up
	vResult *= 1.0 + 0.1 * sin(iTime * 1.6);
	
	return vec4(sqrt(vResult * 1.2), 1.0);
}

void mainVR( out vec4 fragColor, in vec2 fragCoord, vec3 vRayOrigin, vec3 vRayDir )
{
	float fShade = 0.0;
		
	float a = 0.3;
	float b = 8.0;
	float c = 2.4;
	float fZPos = 5.0 + iTime * c + sin(iTime * a) * b;
	float fSpeed = c + a * b * cos(a * iTime);
	
	fParticleLength = 0.3 * fSpeed / 60.0;
	
	float fSeed = 0.0;
	
	// Black background
	vec3 bgColor1 = vec3(0.0);
	vec3 bgColor2 = vec3(0.0);
	vec3 bgColor3 = vec3(0.0);
	
	float bgMix1 = (sin(iTime * 0.2) + 1.0) * 0.5;
	float bgMix2 = (cos(iTime * 0.14) + 1.0) * 0.5;
	
	vec3 vResult = mix(mix(bgColor1, bgColor2, bgMix1), bgColor3, bgMix2);
	
	for(int i=0; i<3; i++)
	{
		vResult += Starfield(vRayDir, fZPos, fSeed);
		fSeed += 1.234;
		fZPos += 2.0;
	}
	
	vResult *= 1.0 + 0.1 * sin(iTime * 1.6);
	
	fragColor = vec4(sqrt(vResult * 1.2), 1.0);
}

`)!;
