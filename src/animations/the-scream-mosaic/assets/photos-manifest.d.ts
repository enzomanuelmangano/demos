interface PhotoManifestEntry {
  id: number;
  rgb: {
    r: number;
    g: number;
    b: number;
  };
  lab: {
    l: number;
    a: number;
    b: number;
  };
}

interface Manifest {
  photos: PhotoManifestEntry[];
  generatedAt: string;
  photoCount: number;
  photoSize: number;
}

declare const manifest: Manifest;
export default manifest;
