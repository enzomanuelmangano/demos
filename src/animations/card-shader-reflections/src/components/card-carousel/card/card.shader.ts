import { Skia } from '@shopify/react-native-skia';

import { CardType } from '../utils/constants';

// Material constants for each card type
export const MATERIALS = {
  [CardType.Silver]: {
    reflectivity: [0.92, 0.92, 0.92], // Pure monochromatic reflectivity
    edgeTint: [0.94, 0.94, 0.94], // Pure monochromatic edge tint
    baseColor: [0.15, 0.15, 0.15], // Darker monochromatic base
    highlights: {
      primary: [0.9, 0.9, 0.9], // Pure monochromatic highlights
      secondary: [0.85, 0.85, 0.85], // Pure monochromatic secondary
    },
    roughness: 0.32, // More roughness for matte look
    normalStrength: 0.2, // Stronger normal mapping for texture
    microDetail: 1.6, // Enhanced micro-detail for brushed look
    tint: {
      color: [0.9, 0.9, 0.9], // Pure monochromatic tint
      intensity: 0.08, // Minimal tint effect
    },
  },
  [CardType.Gold]: {
    reflectivity: [0.92, 0.88, 0.78], // Slightly more yellow
    edgeTint: [0.9, 0.87, 0.82], // Slightly more yellow in edge tint
    baseColor: [0.16, 0.14, 0.11], // Slightly more yellow in base
    highlights: {
      primary: [0.92, 0.88, 0.78], // Matching reflectivity
      secondary: [0.88, 0.85, 0.78], // Slightly more yellow in secondary
    },
    roughness: 0.32, // Keep same roughness
    normalStrength: 0.13, // Keep same normal strength
    microDetail: 1.0, // Keep same micro detail
    tint: {
      color: [0.89, 0.87, 0.82], // Slightly more yellow in tint
      intensity: 0.12, // Keep same intensity
    },
  },
  [CardType.Platinum]: {
    reflectivity: [0.99, 0.98, 0.97],
    edgeTint: [1.0, 0.99, 0.98],
    baseColor: [0.25, 0.24, 0.23],
    highlights: {
      primary: [0.99, 0.98, 0.97],
      secondary: [0.97, 0.96, 0.95],
    },
    roughness: 0.3,
    normalStrength: 0.14,
    microDetail: 1.0,
    tint: {
      color: [0.98, 0.96, 0.94],
      intensity: 0.16,
    },
  },
  [CardType.Metal]: {
    reflectivity: [0.96, 0.96, 0.96],
    edgeTint: [0.98, 0.98, 0.98],
    baseColor: [0.18, 0.18, 0.18],
    highlights: {
      primary: [0.95, 0.95, 0.95],
      secondary: [0.92, 0.92, 0.92],
    },
    roughness: 0.32,
    normalStrength: 0.16,
    microDetail: 1.4,
    tint: {
      color: [0.94, 0.94, 0.94],
      intensity: 0.12,
    },
  },
};

// Convert material properties to GLSL constants
const generateMaterialConstants = () => {
  const constants = [];

  for (const [type, material] of Object.entries(MATERIALS)) {
    const typeName = CardType[type as unknown as CardType].toUpperCase();
    constants.push(`
    const vec3 ${typeName}_REFLECTIVITY = vec3(${material.reflectivity.join(
      ', ',
    )});
    const vec3 ${typeName}_EDGE_TINT = vec3(${material.edgeTint.join(', ')});
    const vec3 ${typeName}_BASE_COLOR = vec3(${material.baseColor.join(', ')});
    const vec3 ${typeName}_PRIMARY_HIGHLIGHT = vec3(${material.highlights.primary.join(
      ', ',
    )});
    const vec3 ${typeName}_SECONDARY_HIGHLIGHT = vec3(${material.highlights.secondary.join(
      ', ',
    )});
    const float ${typeName}_ROUGHNESS = ${material.roughness};
    const float ${typeName}_NORMAL_STRENGTH = ${material.normalStrength};
    const float ${typeName}_MICRO_DETAIL = ${material.microDetail};
    const vec3 ${typeName}_TINT_COLOR = vec3(${material.tint.color.join(', ')});
    const float ${typeName}_TINT_INTENSITY = ${material.tint.intensity};`);
  }

  return constants.join('\n');
};

/**
 * Card Shader Implementation
 * This shader creates realistic metallic card effects with dynamic lighting and reflections.
 * It supports four card types: Silver (0), Gold (1), Platinum (2), and Metal (3).
 */
export const cardShader = Skia.RuntimeEffect.Make(`
    //------------------------------------------------------------------------------
    // Uniform inputs
    //------------------------------------------------------------------------------
    uniform float rotate;          // Rotation angle in radians (from -PI to PI)
    uniform vec2 resolution;       // Screen resolution
    uniform float cardType;        // Card material type (0: Silver, 1: Gold, 2: Platinum, 3: Metal)

    const float PI = 3.14159265359;
    const vec3 BASE_LIGHT_POS = vec3(-3.0, -0.8, 2.5);  // Stronger light from left side

    //------------------------------------------------------------------------------
    // Material Constants
    //------------------------------------------------------------------------------
    ${generateMaterialConstants()}

    //------------------------------------------------------------------------------
    // Utility Functions
    //------------------------------------------------------------------------------
    float pow2(float x) { return x * x; }
    vec3 pow2(vec3 x) { return x * x; }

    // Enhanced hash function for better randomness
    float hash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * vec3(443.897, 441.423, 437.195));
        p3 += dot(p3, p3.yzx + 19.19);
        return fract((p3.x + p3.y) * p3.z);
    }

    // Perlin noise implementation
    float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);  // Smoothstep
        
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    // Enhanced dynamic light calculation
    vec3 calculateOrbitalLight(float time, vec3 basePos, float speed, float radius) {
        float angle = time * speed;
        float x = basePos.x + cos(angle) * radius;
        float y = basePos.y + sin(angle * 0.5) * radius * 0.5;
        float z = basePos.z + sin(angle) * radius;
        return normalize(vec3(x, y, z));
    }

    vec3 calculateSweepingLight(float time, vec3 basePos) {
        // Create a sweeping motion
        float sweep = sin(time * 0.7) * 2.0;
        float height = cos(time * 0.5) * 0.5;
        return normalize(vec3(sweep, height, basePos.z));
    }
        
    float calculateMetallicDetail(vec2 uv, float cardType) {
        // Fine metallic grain with moderate frequencies
        float fine = noise(uv * 1600.0) * 0.35;     // Reduced frequency and intensity
        float medium = noise(uv * 800.0) * 0.3;     // Reduced frequency
        float rough = noise(uv * 400.0) * 0.2;      // Reduced frequency
        
        // Directional grain for metallic finish
        vec2 rotatedUV = vec2(
            uv.x * cos(PI * 0.15) - uv.y * sin(PI * 0.15),  // Back to original angle
            uv.x * sin(PI * 0.15) + uv.y * cos(PI * 0.15)
        );
        float directional = noise(rotatedUV * 1000.0) * 0.4;  // Reduced frequency and intensity
        
        float detail = (fine + medium + rough + directional) * 0.4;  // Reduced overall intensity
        
        // Card-specific adjustments with moderate intensity
        float intensity = cardType < 0.5 ? 1.0 :    // Silver - normal
                         cardType < 1.5 ? 0.9 :     // Gold - subtle
                         cardType < 2.5 ? 0.95 :    // Platinum - balanced
                         1.1;                       // Metal - slightly enhanced
        
        return detail * intensity;
    }

    vec3 calculateNormal(vec2 uv, float normalStrength, float cardType) {
        vec2 eps = vec2(1.0) / resolution;  // Back to original epsilon
        
        float c = calculateMetallicDetail(uv, cardType);
        float r = calculateMetallicDetail(uv + vec2(eps.x, 0.0), cardType);
        float t = calculateMetallicDetail(uv + vec2(0.0, eps.y), cardType);
        
        vec3 normal = normalize(vec3(
            (r - c) * normalStrength * 2.0,  // Back to original strength
            (t - c) * normalStrength * 2.0,
            1.0  // Back to original Z component
        ));
        
        return normal;
    }

    // Dynamic light position with enhanced movement
    vec3 calculateDynamicLight(vec2 uv, float rotationAngle) {
        vec3 baseLight = BASE_LIGHT_POS;
        
        // Primary rotation - reversed to maintain left-side lighting
        float c = cos(-rotationAngle);  // Negative rotation to maintain position
        float s = sin(-rotationAngle);
        
        vec3 rotatedLight = vec3(
            baseLight.x * c - baseLight.z * s,
            baseLight.y,
            baseLight.x * s + baseLight.z * c
        );
        
        return normalize(rotatedLight);
    }

    // Enhanced specular calculation with dynamic effects
    vec3 calculateEnhancedSpecular(vec3 normal, vec3 viewDir, vec3 lightDir, vec3 baseColor, float roughness, float rotationAngle) {
        vec3 halfDir = normalize(lightDir + viewDir);
        float NdotH = max(dot(normal, halfDir), 0.0);
        float NdotV = max(dot(normal, viewDir), 0.0);
        float NdotL = max(dot(normal, lightDir), 0.0);
        
        // Dynamic roughness based on rotation speed
        float speedFactor = abs(sin(rotationAngle));
        float dynamicRoughness = roughness * (0.6 + speedFactor * 0.4);  // Reduced roughness for stronger specular
        
        // Enhanced specular power with motion-based variation
        float specPower = (1.0 - dynamicRoughness) * (156.0 + speedFactor * 100.0) + 16.0;  // Increased specular power
        float specular = pow(NdotH, specPower);
        
        // Add rim lighting effect
        float rim = pow(1.0 - NdotV, 3.0 + speedFactor * 2.0);  // Stronger rim light
        
        // Motion-enhanced fresnel
        float fresnel = pow(1.0 - NdotV, 2.5 + speedFactor * 1.5);  // Stronger fresnel
        
        // Combine effects with motion-based intensity
        float specIntensity = 1.6 + speedFactor * 0.8;  // Increased specular intensity
        float rimIntensity = 0.7 + speedFactor * 0.6;   // Increased rim intensity
        
        return baseColor * (
            specular * specIntensity * pow(NdotL, 1.8) +  // Increased light contribution
            rim * rimIntensity +
            fresnel * 0.8  // Increased fresnel contribution
        ) * (1.0 - dynamicRoughness * 0.4);  // Reduced roughness impact
    }

    //------------------------------------------------------------------------------
    // Material Functions
    //------------------------------------------------------------------------------
    
    // Fresnel equation for conductors (metals)
    vec3 fresnelConductor(float cosTheta, vec3 reflectivity, vec3 edgeTint) {
        vec3 r = clamp(reflectivity, vec3(0.0), vec3(0.99));
        vec3 r_sqrt = sqrt(r);
        vec3 n = mix((1.0 + r_sqrt) / (1.0 - r_sqrt), (1.0 - r) / (1.0 + r), edgeTint);
        vec3 k2 = ((n + 1.0) * (n + 1.0) * r - (n - 1.0) * (n - 1.0)) / (1.0 - r);
        k2 = max(k2, vec3(0.0));
        vec3 k = sqrt(k2);

        vec3 rs_num = pow2(n) + pow2(k) - 2.0 * n * cosTheta + pow2(vec3(cosTheta));
        vec3 rs_den = pow2(n) + pow2(k) + 2.0 * n * cosTheta + pow2(vec3(cosTheta));
        vec3 rs = rs_num / rs_den;
        
        vec3 rp_num = (pow2(n) + pow2(k)) * pow2(vec3(cosTheta)) - 2.0 * n * cosTheta + vec3(1.0);
        vec3 rp_den = (pow2(n) + pow2(k)) * pow2(vec3(cosTheta)) + 2.0 * n * cosTheta + vec3(1.0);
        vec3 rp = rp_num / rp_den;
        
        return clamp(0.5 * (rs + rp), vec3(0.0), vec3(1.0));
    }

    // Get metal properties based on card type
    vec3 getMetalProperties(float type, out vec3 edgeTint) {
        if (type < 0.5) {         // Silver
            edgeTint = SILVER_EDGE_TINT;
            return SILVER_REFLECTIVITY;
        } else if (type < 1.5) {  // Gold
            edgeTint = GOLD_EDGE_TINT;
            return GOLD_REFLECTIVITY;
        } else if (type < 2.5) {  // Platinum
            edgeTint = PLATINUM_EDGE_TINT;
            return PLATINUM_REFLECTIVITY;
        } else {                  // Metal
            edgeTint = METAL_EDGE_TINT;
            return METAL_REFLECTIVITY;
        }
    }

    // Get base color for each card type
    vec3 getBaseColor(float type) {
        if (type < 0.5) return SILVER_BASE_COLOR;      // Silver
        if (type < 1.5) return GOLD_BASE_COLOR;        // Gold
        if (type < 2.5) return PLATINUM_BASE_COLOR;    // Platinum
        return METAL_BASE_COLOR;                       // Metal
    }

    // Get highlight colors for each card type
    vec3 getHighlightColor(float type, bool isPrimary) {
        if (type < 0.5) {         // Silver
            return isPrimary ? SILVER_PRIMARY_HIGHLIGHT : SILVER_SECONDARY_HIGHLIGHT;
        } else if (type < 1.5) {  // Gold
            return isPrimary ? GOLD_PRIMARY_HIGHLIGHT : GOLD_SECONDARY_HIGHLIGHT;
        } else if (type < 2.5) {  // Platinum
            return isPrimary ? PLATINUM_PRIMARY_HIGHLIGHT : PLATINUM_SECONDARY_HIGHLIGHT;
        } else {                  // Metal
            return isPrimary ? METAL_PRIMARY_HIGHLIGHT : METAL_SECONDARY_HIGHLIGHT;
        }
    }

    //------------------------------------------------------------------------------
    // Environment Mapping
    //------------------------------------------------------------------------------
    
    // Calculate environment reflection color
    vec3 envMap(vec3 r, float roughness, float type) {
        vec2 envUV = vec2(atan(r.z, r.x) / (2.0 * PI) + 0.5, acos(r.y) / PI);
        
        // Light positions in environment map
        vec2 light1 = vec2(0.3, 0.4);
        vec2 light2 = vec2(0.7, 0.6);
        
        // Calculate light intensities
        float intensity1 = pow(1.0 - distance(envUV, light1) * 1.8, 6.0);
        float intensity2 = pow(1.0 - distance(envUV, light2) * 1.8, 6.0);
        
        // Get colors for environment mapping
        vec3 baseColor = getBaseColor(type);
        vec3 highlight1 = getHighlightColor(type, true);
        vec3 highlight2 = getHighlightColor(type, false);
        
        // Combine colors with light intensities
        vec3 envColor = baseColor + 
            highlight1 * intensity1 * 1.6 + 
            highlight2 * intensity2 * 1.6;
            
        // Apply color shift based on view angle
        float colorShift = pow(1.0 - r.y, 4.0) * 0.8;
        
        // Apply type-specific color adjustments
        if (type < 0.5) {         // Silver
            envColor *= vec3(1.0 + colorShift * 0.05);
        } else if (type < 1.5) {  // Gold
            envColor *= vec3(1.0 + colorShift * 0.08, 1.0 + colorShift * 0.06, 1.0 + colorShift * 0.02);
        } else if (type < 2.5) {  // Platinum
            envColor *= vec3(1.0 + colorShift * 0.06, 1.0 + colorShift * 0.05, 1.0 + colorShift * 0.04);
        } else {                  // Metal
            envColor *= vec3(1.0 + colorShift * 0.04);
        }
        
        // Mix with base metal color based on roughness
        vec3 mixColor = type < 0.5 ? 
            vec3(0.4, 0.4, 0.45) :        // Silver
            (type < 1.5 ? 
                vec3(0.45, 0.35, 0.15) :  // Gold
                (type < 2.5 ?
                    vec3(0.42, 0.41, 0.4) :   // Platinum
                    vec3(0.35, 0.35, 0.35)));  // Metal
                
        return mix(envColor, mixColor, roughness);
    }

    vec4 main(vec2 fragCoord) {
        vec2 uv = fragCoord / resolution;
        vec3 viewDir = normalize(vec3(uv * 2.0 - 1.0, 1.0));
        
        // Use rotate directly (already in radians from -PI to PI)
        float rotationAngle = rotate;
        float rotationSpeed = abs(sin(rotationAngle));
        
        // Get material properties with dynamic adjustments
        vec3 edgeTint;
        vec3 reflectivity = getMetalProperties(cardType, edgeTint);
        vec3 baseColor = getBaseColor(cardType);
        float roughness = cardType < 0.5 ? SILVER_ROUGHNESS :
                         cardType < 1.5 ? GOLD_ROUGHNESS :
                         cardType < 2.5 ? PLATINUM_ROUGHNESS :
                         METAL_ROUGHNESS;
        
        // Dynamic light calculation
        vec3 lightDir = calculateDynamicLight(uv, rotationAngle);
        
        // Enhanced normal calculation with moderate strength
        float normalStrength = (cardType < 0.5 ? SILVER_NORMAL_STRENGTH * 1.1 :    // Silver
                              cardType < 1.5 ? GOLD_NORMAL_STRENGTH * 1.0 :        // Gold
                              cardType < 2.5 ? PLATINUM_NORMAL_STRENGTH * 1.05 :    // Platinum
                              METAL_NORMAL_STRENGTH * 1.15) *                       // Metal
                              (1.0 + rotationSpeed * 0.15);  // Reduced motion influence
        
        // Reduced motion-based normal distortion
        vec2 distortedUV = uv + vec2(
            sin(rotationAngle * 0.5) * 0.015,  // Moderate distortion
            cos(rotationAngle * 0.7) * 0.015   // Moderate distortion
        );
        vec3 normal = calculateNormal(distortedUV, normalStrength, cardType);
        
        // Calculate enhanced specular
        vec3 specular = calculateEnhancedSpecular(normal, viewDir, lightDir, baseColor, roughness, rotationAngle);
        
        // Dynamic fresnel calculation
        float fresnelBase = max(dot(normal, viewDir), 0.0);
        float fresnelScale = 1.0 + rotationSpeed * 0.4;
        vec3 fresnel = fresnelConductor(fresnelBase, reflectivity * fresnelScale, edgeTint);
        
        // Enhanced environment mapping
        vec3 reflectDir = reflect(-viewDir, normal);
        float envRoughness = roughness * (0.5 + rotationSpeed * 0.3);
        vec3 envColor = envMap(reflectDir, envRoughness, cardType);
        
        // Dynamic color combination with stronger lighting
        vec3 finalColor = mix(baseColor, envColor, fresnel * (0.8 + rotationSpeed * 0.3));
        finalColor = finalColor * (0.5 + 0.7 * pow(max(dot(normal, lightDir), 0.0), 1.4)) + specular * 1.2;  // Increased light contribution
        
        // Enhanced metallic pattern with motion distortion
        float metallicPattern = calculateMetallicDetail(distortedUV, cardType);
        finalColor *= (1.0 + metallicPattern * (0.35 + rotationSpeed * 0.45));
        
        // Motion-based contrast enhancement
        float contrastBoost = 0.85 + rotationSpeed * 0.2;  // Reduced contrast for brighter highlights
        finalColor = pow(finalColor, vec3(contrastBoost));
        
        // Dynamic vignette with motion influence
        vec2 vignetteCenter = vec2(
            0.5 + sin(rotationAngle) * 0.15,
            0.5 + cos(rotationAngle * 0.7) * 0.1
        );
        float vignette = 1.0 - length((uv - vignetteCenter) * (1.5 + rotationSpeed * 0.5));
        finalColor *= mix(0.85, 1.0, vignette);
        
        // Add subtle color shift based on rotation
        float colorShift = sin(rotationAngle * 0.5) * 0.1;
        finalColor += vec3(colorShift, colorShift * 0.5, -colorShift * 0.5) * rotationSpeed * 0.2;
        
        return vec4(finalColor, 1.0);
    }
`)!;
