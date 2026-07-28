import { useRef, useMemo } from 'react'
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

export type ViewState = 'lying' | 'sit' | 'stand' | 'exploded'

interface StateParams {
  board: number
  knee: number
  explode: number
}

const STATE_PARAMS: Record<ViewState, StateParams> = {
  lying: { board: 88, knee: 0, explode: 0 },
  sit: { board: 12, knee: 62, explode: 0 },
  stand: { board: 4, knee: 0, explode: 0 },
  exploded: { board: 12, knee: 62, explode: 1 },
}

const deg = (d: number) => (d * Math.PI) / 180
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const COLORS = {
  steel: '#5c7d8c',
  steelDark: '#33495a',
  board: '#23272e',
  boardEdge: '#15181c',
  strap: '#c8622c',
  gold: '#b28a2a',
  teal: '#4a9080',
  ink: '#12151a',
  foot: '#3a3f47',
}

const PIVOT: [number, number, number] = [0, 0.2, -0.3]
const LEG_LEN = 0.55
const TORSO_LEN = 1.15
const RAIL_X = 0.3
const FRONT_Z = -0.45
const REAR_Z = 0.45
const BASE_Y = 0.12

function Selectable({
  id,
  onSelect,
  children,
}: {
  id: string
  onSelect: (id: string) => void
  children: React.ReactNode
}) {
  return (
    <group
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        onSelect(id)
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'auto'
      }}
    >
      {children}
    </group>
  )
}

function Caster({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0.05, z]}>
      <mesh castShadow position={[0, 0.09, 0]}>
        <boxGeometry args={[0.02, 0.08, 0.02]} />
        <meshStandardMaterial color={COLORS.ink} metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.03, 20]} />
        <meshStandardMaterial color={COLORS.ink} metalness={0.5} roughness={0.5} />
      </mesh>
    </group>
  )
}

function Rig({ state, onSelect }: { state: ViewState; onSelect: (id: string) => void }) {
  const boardGroup = useRef<THREE.Group>(null!)
  const kneeGroup = useRef<THREE.Group>(null!)
  const legMesh = useRef<THREE.Group>(null!)
  const torsoMesh = useRef<THREE.Group>(null!)
  const strutGroup = useRef<THREE.Group>(null!)

  const current = useRef<StateParams>({ ...STATE_PARAMS.sit })

  useFrame((_, delta) => {
    const target = STATE_PARAMS[state]
    const t = Math.min(1, delta * 4)
    current.current.board = lerp(current.current.board, target.board, t)
    current.current.knee = lerp(current.current.knee, target.knee, t)
    current.current.explode = lerp(current.current.explode, target.explode, t)

    const c = current.current
    if (boardGroup.current) {
      boardGroup.current.rotation.x = deg(c.board)
    }
    if (kneeGroup.current) {
      kneeGroup.current.rotation.x = deg(c.knee)
      kneeGroup.current.position.y = LEG_LEN + c.explode * 0.35
    }
    if (strutGroup.current) {
      strutGroup.current.rotation.x = deg(c.board * 0.55)
    }
  })

  const legGeom = useMemo(() => new THREE.BoxGeometry(0.5, LEG_LEN, 0.08), [])
  const torsoGeom = useMemo(() => new THREE.BoxGeometry(0.5, TORSO_LEN, 0.08), [])

  return (
    <group>
      {/* ---- BASE (static anchor) ---- */}
      <Selectable id="base" onSelect={onSelect}>
        <mesh castShadow receiveShadow position={[-RAIL_X, BASE_Y, 0]}>
          <boxGeometry args={[0.05, 0.05, REAR_Z - FRONT_Z]} />
          <meshStandardMaterial color={COLORS.steel} metalness={0.7} roughness={0.35} />
        </mesh>
        <mesh castShadow receiveShadow position={[RAIL_X, BASE_Y, 0]}>
          <boxGeometry args={[0.05, 0.05, REAR_Z - FRONT_Z]} />
          <meshStandardMaterial color={COLORS.steel} metalness={0.7} roughness={0.35} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, BASE_Y, FRONT_Z]}>
          <boxGeometry args={[RAIL_X * 2, 0.05, 0.05]} />
          <meshStandardMaterial color={COLORS.steel} metalness={0.7} roughness={0.35} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, BASE_Y, REAR_Z]}>
          <boxGeometry args={[RAIL_X * 2, 0.05, 0.05]} />
          <meshStandardMaterial color={COLORS.steel} metalness={0.7} roughness={0.35} />
        </mesh>
      </Selectable>

      <Selectable id="casters" onSelect={onSelect}>
        <Caster x={-RAIL_X} z={FRONT_Z} />
        <Caster x={RAIL_X} z={FRONT_Z} />
        <Caster x={-RAIL_X} z={REAR_Z} />
        <Caster x={RAIL_X} z={REAR_Z} />
      </Selectable>

      <Selectable id="mast" onSelect={onSelect}>
        <mesh castShadow position={[0, (BASE_Y + PIVOT[1]) / 2, PIVOT[2]]}>
          <boxGeometry args={[0.05, PIVOT[1] - BASE_Y, 0.05]} />
          <meshStandardMaterial color={COLORS.steel} metalness={0.7} roughness={0.35} />
        </mesh>
      </Selectable>

      {/* ---- worm-gear hand-crank jack (self-locking, visual approximation) ---- */}
      <Selectable id="strut" onSelect={onSelect}>
        <group ref={strutGroup} position={[0.14, BASE_Y + 0.05, PIVOT[2] + 0.05]}>
          <mesh castShadow position={[0, 0.18, 0]}>
            <cylinderGeometry args={[0.018, 0.018, 0.36, 12]} />
            <meshStandardMaterial color={COLORS.steelDark} metalness={0.85} roughness={0.2} />
          </mesh>
        </group>
      </Selectable>

      {/* ---- hand crank handle, folds against the jack body when stowed ---- */}
      <Selectable id="lock" onSelect={onSelect}>
        <group position={[0.14, BASE_Y + 0.05, PIVOT[2] + 0.05]}>
          <mesh castShadow position={[0.06, 0.02, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.008, 0.008, 0.09, 8]} />
            <meshStandardMaterial color={COLORS.ink} metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh castShadow position={[0.1, 0.02, 0]}>
            <cylinderGeometry args={[0.014, 0.014, 0.03, 10]} />
            <meshStandardMaterial color={COLORS.strap} metalness={0.3} roughness={0.5} />
          </mesh>
        </group>
      </Selectable>

      {/* ---- BOARD ASSEMBLY (pivots at hip/mast top) ---- */}
      <group ref={boardGroup} position={PIVOT}>
        <Selectable id="leg" onSelect={onSelect}>
          <group ref={legMesh} position={[0, LEG_LEN / 2, 0]}>
            <mesh castShadow receiveShadow geometry={legGeom}>
              <meshStandardMaterial color={COLORS.board} roughness={0.75} />
            </mesh>
          </group>
        </Selectable>

        <Selectable id="footplate" onSelect={onSelect}>
          <mesh castShadow position={[0, 0.02, 0.09]} rotation={[Math.PI / 2.6, 0, 0]}>
            <boxGeometry args={[0.3, 0.22, 0.02]} />
            <meshStandardMaterial color={COLORS.foot} roughness={0.8} />
          </mesh>
        </Selectable>

        <group ref={kneeGroup} position={[0, LEG_LEN, 0]}>
          <Selectable id="torso" onSelect={onSelect}>
            <group ref={torsoMesh} position={[0, TORSO_LEN / 2, 0]}>
              <mesh castShadow receiveShadow geometry={torsoGeom}>
                <meshStandardMaterial color={COLORS.board} roughness={0.75} />
              </mesh>
            </group>
          </Selectable>

          <Selectable id="straps" onSelect={onSelect}>
            <mesh position={[0, 0.28, 0.045]}>
              <boxGeometry args={[0.52, 0.05, 0.01]} />
              <meshStandardMaterial color={COLORS.strap} roughness={0.6} />
            </mesh>
            <mesh position={[0, 0.62, 0.045]}>
              <boxGeometry args={[0.52, 0.05, 0.01]} />
              <meshStandardMaterial color={COLORS.strap} roughness={0.6} />
            </mesh>
            <mesh position={[0, 0.02, 0.045]}>
              <boxGeometry args={[0.5, 0.04, 0.01]} />
              <meshStandardMaterial color={COLORS.strap} roughness={0.6} />
            </mesh>
          </Selectable>

          <Selectable id="tray" onSelect={onSelect}>
            <mesh castShadow position={[0, 0.42, 0.14]}>
              <boxGeometry args={[0.5, 0.02, 0.35]} />
              <meshStandardMaterial color={COLORS.teal} roughness={0.5} />
            </mesh>
          </Selectable>

          <Selectable id="headwings" onSelect={onSelect}>
            <mesh castShadow position={[-0.17, TORSO_LEN - 0.1, 0.02]}>
              <boxGeometry args={[0.12, 0.2, 0.06]} />
              <meshStandardMaterial color={COLORS.gold} roughness={0.7} />
            </mesh>
            <mesh castShadow position={[0.17, TORSO_LEN - 0.1, 0.02]}>
              <boxGeometry args={[0.12, 0.2, 0.06]} />
              <meshStandardMaterial color={COLORS.gold} roughness={0.7} />
            </mesh>
          </Selectable>

          <Selectable id="armrest" onSelect={onSelect}>
            <mesh castShadow position={[-0.29, 0.5, 0.05]}>
              <boxGeometry args={[0.05, 0.03, 0.3]} />
              <meshStandardMaterial color={COLORS.steelDark} metalness={0.5} roughness={0.5} />
            </mesh>
            <mesh castShadow position={[0.29, 0.5, 0.05]}>
              <boxGeometry args={[0.05, 0.03, 0.3]} />
              <meshStandardMaterial color={COLORS.steelDark} metalness={0.5} roughness={0.5} />
            </mesh>
          </Selectable>
        </group>
      </group>
    </group>
  )
}

function Ground() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial color="#cfc6ac" roughness={0.95} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow>
        <planeGeometry args={[8, 8]} />
        <shadowMaterial opacity={0.18} />
      </mesh>
      <gridHelper args={[8, 32, '#8f8567', '#a9a082']} position={[0, 0.002, 0]} />
    </group>
  )
}

export default function Scene({
  state,
  onSelect,
}: {
  state: ViewState
  onSelect: (id: string) => void
}) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.6]}
      camera={{ position: [2.1, 1.6, 2.3], fov: 38 }}
      onPointerMissed={() => onSelect('')}
    >
      <color attach="background" args={['#dcd4bf']} />
      <fog attach="fog" args={['#dcd4bf', 5, 11]} />
      <ambientLight intensity={0.8} />
      <directionalLight
        position={[3, 4, 2]}
        intensity={1.7}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-2}
        shadow-camera-right={2}
        shadow-camera-top={2}
        shadow-camera-bottom={-2}
      />
      <directionalLight position={[-3, 2, -2]} intensity={0.5} color="#eef2f5" />
      <Ground />
      <Rig state={state} onSelect={onSelect} />
      <OrbitControls
        makeDefault
        target={[0, 0.9, 0]}
        minDistance={1.6}
        maxDistance={5}
        maxPolarAngle={Math.PI / 2.05}
        enableDamping
        dampingFactor={0.08}
      />
    </Canvas>
  )
}
