import * as THREE from 'three';
import { hex } from '../design/tokens';
import { cfhTexture, logoSize, type CfhLogo } from './neon';

/**
 * A Club CFH neon sign: the logo bent from tubes, lit on a black acrylic board.
 * Faces +z; rotate the group to face the room. Buzzes and flickers like real
 * neon, and brightens a touch on every kick.
 */
export class CfhSign {
  readonly group = new THREE.Group();
  private mat: THREE.MeshBasicMaterial;
  private light: THREE.PointLight | null = null;
  private lightBase: number;
  /** Offsets each sign's flicker so a pair never drops out together. */
  private phase: number;

  /** @param width the logo's width in metres (the board and halo are a little wider) */
  constructor(which: CfhLogo, width: number, o: { light?: number; phase?: number } = {}) {
    const [w, h] = logoSize(which);
    const height = (width * h) / w;
    const { texture, frame, aspect } = cfhTexture(which, which === 'lockup' ? 2.6 : 12);
    this.phase = o.phase ?? 0;

    const boardW = width * 1.14;
    const boardH = height * 1.16;
    const board = new THREE.Mesh(new THREE.BoxGeometry(boardW, boardH, 0.04), new THREE.MeshStandardMaterial({ color: hex('graphite-1000'), roughness: 0.25, metalness: 0.4 }));
    board.position.z = 0.02;
    this.group.add(board);

    this.mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
    const planeW = width * frame;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(planeW, planeW / aspect), this.mat);
    face.position.z = 0.05;
    face.renderOrder = 2;
    this.group.add(face);

    // standoffs that hold the board off the wall
    const post = new THREE.MeshStandardMaterial({ color: hex('tt-chrome'), roughness: 0.3, metalness: 0.9 });
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8), post);
        p.rotation.x = Math.PI / 2;
        p.position.set((sx * boardW) / 2 - 0.05, (sy * boardH) / 2 - 0.05, -0.005);
        this.group.add(p);
      }

    this.lightBase = o.light ?? 0;
    if (this.lightBase > 0) {
      this.light = new THREE.PointLight(hex('cfh-pink'), this.lightBase, 7, 1.6);
      this.light.position.set(0, 0, 0.7);
      this.group.add(this.light);
    }
  }

  /** Neon buzz: drops out now and then; `kick` (0..1, 1 on the beat) lifts it a little. */
  update(time: number, kick: number): void {
    const t = time + this.phase;
    const burst = t % 13.7;
    let k = 1;
    if (burst < 0.4) k = Math.sin(t * 79) > 0.2 ? 1 : 0.2;
    else if (burst > 7 && burst < 7.1) k = 0.4;
    k *= 1 + 0.03 * Math.sin(t * 120); // the hum
    const lift = 1 + 0.12 * kick;
    this.mat.color.setScalar(1.6 * k * lift);
    if (this.light) this.light.intensity = this.lightBase * k * lift;
  }
}
