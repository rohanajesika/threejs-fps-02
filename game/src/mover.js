// Shared character movement: acceleration, friction, gravity, crouch and jump,
// resolved as a box against the world's colliders one axis at a time, so a wall
// never swallows a character. The player and every bot move through this.
import * as THREE from 'three';

export function createMover(colliders, opts) {
  const radius = opts.radius;
  const standHeight = opts.standHeight;
  const crouchHeight = opts.crouchHeight;
  const standEye = opts.standEye;
  const crouchEye = opts.crouchEye;
  const probe = new THREE.Box3();

  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - radius, y + lift, z - radius);
    probe.max.set(x + radius, y + height - lift, z + radius);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }

  function makeBody(x, z, yaw) {
    return {
      position: new THREE.Vector3(x, 0, z),
      velocity: new THREE.Vector3(),
      yaw,
      pitch: 0,
      eye: standEye,
      onGround: true,
      crouching: false,
      height: standHeight,
    };
  }

  // wish: {forward, strafe} in -1..1; speed in m/s; jump true on the jump frame.
  function step(body, dt, wish, speed, jump) {
    const crouching = wish.crouch === true;
    if (crouching && !body.crouching) {
      body.crouching = true;
      body.height = crouchHeight;
    } else if (!crouching && body.crouching && !overlaps(body.position.x, body.position.y, body.position.z, standHeight, 0.02)) {
      body.crouching = false;
      body.height = standHeight;
    }
    const eyeTarget = body.crouching ? crouchEye : standEye;
    body.eye += (eyeTarget - body.eye) * Math.min(1, dt * 12);

    const sin = Math.sin(body.yaw);
    const cos = Math.cos(body.yaw);
    const wx = -sin * wish.forward + cos * wish.strafe;
    const wz = -cos * wish.forward - sin * wish.strafe;
    const len = Math.hypot(wx, wz);
    const nx = len > 0 ? wx / len : 0;
    const nz = len > 0 ? wz / len : 0;
    const accel = body.onGround ? opts.groundAccel : opts.airAccel;
    const blend = Math.min(1, (accel * dt) / speed);
    body.velocity.x += (nx * speed - body.velocity.x) * blend;
    body.velocity.z += (nz * speed - body.velocity.z) * blend;
    if (body.onGround && len === 0) {
      const damp = Math.max(0, 1 - opts.friction * dt);
      body.velocity.x *= damp;
      body.velocity.z *= damp;
    }

    if (jump && body.onGround) {
      body.velocity.y = opts.jumpSpeed;
      body.onGround = false;
    }
    body.velocity.y -= opts.gravity * dt;

    const nextX = body.position.x + body.velocity.x * dt;
    if (!overlaps(nextX, body.position.y, body.position.z, body.height, 0.04)) body.position.x = nextX;
    else body.velocity.x = 0;
    const nextZ = body.position.z + body.velocity.z * dt;
    if (!overlaps(body.position.x, body.position.y, nextZ, body.height, 0.04)) body.position.z = nextZ;
    else body.velocity.z = 0;

    body.position.y += body.velocity.y * dt;
    body.onGround = false;
    const hit = overlaps(body.position.x, body.position.y, body.position.z, body.height, 0);
    if (hit && body.velocity.y <= 0) {
      body.position.y = hit.max.y;
      body.velocity.y = 0;
      body.onGround = true;
    } else if (hit) {
      body.position.y = hit.min.y - body.height;
      body.velocity.y = 0;
    }
    if (body.position.y < 0) {
      body.position.y = 0;
      body.velocity.y = 0;
      body.onGround = true;
    }
    body.velocity.y = Math.max(-30, body.velocity.y);
  }

  function look(body, dx, dy, sensitivity = 0.0022) {
    body.yaw -= dx * sensitivity;
    body.pitch = Math.max(-1.45, Math.min(1.45, body.pitch - dy * sensitivity));
  }

  function recoil(body, pitchKick, yawKick) {
    body.pitch = Math.min(1.45, body.pitch + pitchKick);
    body.yaw += yawKick;
  }

  return {
    makeBody, step, look, recoil,
    groundSpeed(body) {
      return Math.hypot(body.velocity.x, body.velocity.z);
    },
  };
}
