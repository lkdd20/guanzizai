'use client'

import Image from 'next/image'
import { Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'

import styles from './muyu-strike.module.css'

interface StrikeFeedback {
  id: number
  value: number
  offset: number
}

interface MeritMilestone {
  id: number
}

type MalletPhase = 'hidden' | 'entering' | 'striking' | 'exiting'
type WoodGrainStage = 0 | 1 | 2 | 3

const audioPoolSize = 4
const feedbackOffsets = [-34, 24, -8, 38, -22, 12]
const impactDelayMs = 205
const malletIdleMs = 850
const malletExitMs = 180
const meritMilestoneInterval = 10
const meritMilestoneDurationMs = 2400

function getWoodGrainStage(count: number): WoodGrainStage {
  if (count >= 1000) return 3
  if (count >= 500) return 2
  if (count >= 100) return 1
  return 0
}

export function MuyuStrike() {
  const [count, setCount] = useState(0)
  const [strikeId, setStrikeId] = useState(0)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [feedbacks, setFeedbacks] = useState<StrikeFeedback[]>([])
  const [milestone, setMilestone] = useState<MeritMilestone | null>(null)
  const [malletPhase, setMalletPhase] = useState<MalletPhase>('hidden')
  const audioPoolRef = useRef<HTMLAudioElement[]>([])
  const audioIndexRef = useRef(0)
  const countRef = useRef(0)
  const strikeIdRef = useRef(0)
  const malletPhaseRef = useRef<MalletPhase>('hidden')
  const malletIdleTimerRef = useRef<number | null>(null)
  const malletHiddenTimerRef = useRef<number | null>(null)
  const milestoneTimerRef = useRef<number | null>(null)
  const timersRef = useRef<number[]>([])

  useEffect(() => {
    audioPoolRef.current = Array.from({ length: audioPoolSize }, () => {
      const audio = new Audio('/sfx-muyu.mp3')
      audio.preload = 'auto'
      audio.volume = 0.58
      return audio
    })

    return () => {
      timersRef.current.forEach(window.clearTimeout)
      if (malletIdleTimerRef.current !== null) window.clearTimeout(malletIdleTimerRef.current)
      if (malletHiddenTimerRef.current !== null) window.clearTimeout(malletHiddenTimerRef.current)
      if (milestoneTimerRef.current !== null) window.clearTimeout(milestoneTimerRef.current)
      audioPoolRef.current.forEach((audio) => {
        audio.pause()
        audio.removeAttribute('src')
      })
    }
  }, [])

  function playStrikeSound() {
    if (!soundEnabled || audioPoolRef.current.length === 0) return

    const audio = audioPoolRef.current[audioIndexRef.current % audioPoolRef.current.length]
    audioIndexRef.current += 1
    audio.currentTime = 0
    void audio.play().catch(() => undefined)
  }

  function handleStrike() {
    const nextId = strikeIdRef.current + 1
    const nextCount = countRef.current + 1
    const feedback: StrikeFeedback = {
      id: nextId,
      value: nextCount,
      offset: feedbackOffsets[nextId % feedbackOffsets.length],
    }

    strikeIdRef.current = nextId
    countRef.current = nextCount
    const nextMalletPhase: MalletPhase = malletPhaseRef.current === 'hidden' ? 'entering' : 'striking'
    malletPhaseRef.current = nextMalletPhase
    setMalletPhase(nextMalletPhase)
    setStrikeId(nextId)

    if (malletIdleTimerRef.current !== null) window.clearTimeout(malletIdleTimerRef.current)
    if (malletHiddenTimerRef.current !== null) window.clearTimeout(malletHiddenTimerRef.current)

    malletIdleTimerRef.current = window.setTimeout(() => {
      malletPhaseRef.current = 'exiting'
      setMalletPhase('exiting')
      malletIdleTimerRef.current = null

      malletHiddenTimerRef.current = window.setTimeout(() => {
        malletPhaseRef.current = 'hidden'
        setMalletPhase('hidden')
        malletHiddenTimerRef.current = null
      }, malletExitMs)
    }, malletIdleMs)

    const impactTimer = window.setTimeout(() => {
      setCount(nextCount)
      setFeedbacks((current) => [...current.slice(-4), feedback])
      playStrikeSound()

      if (nextCount % meritMilestoneInterval === 0) {
        if (milestoneTimerRef.current !== null) window.clearTimeout(milestoneTimerRef.current)
        setMilestone({ id: nextId })
        milestoneTimerRef.current = window.setTimeout(() => {
          setMilestone(null)
          milestoneTimerRef.current = null
        }, meritMilestoneDurationMs)
      }

      const removalTimer = window.setTimeout(() => {
        setFeedbacks((current) => current.filter((item) => item.id !== nextId))
        timersRef.current = timersRef.current.filter((item) => item !== removalTimer)
      }, 1050)
      timersRef.current.push(removalTimer)
      timersRef.current = timersRef.current.filter((item) => item !== impactTimer)
    }, impactDelayMs)
    timersRef.current.push(impactTimer)
  }

  const malletMotionClass =
    malletPhase === 'entering'
      ? styles.isEntering
      : malletPhase === 'striking'
        ? styles.isRepeating
        : malletPhase === 'exiting'
          ? styles.isExiting
          : ''
  const woodGrainStage = getWoodGrainStage(count)

  return (
    <div className={styles.muyuExperience}>
      <button
        className={styles.strikeButton}
        type="button"
        onClick={handleStrike}
        aria-label={`敲木鱼，当前功德 ${count}`}
      >
        <span className={styles.scene} aria-hidden="true">
          {count > 0 ? (
            <span className={styles.countDisplay} key={`count-${count}`}>
              <span>功德</span>
              <strong>{count.toLocaleString('zh-CN')}</strong>
            </span>
          ) : null}

          {strikeId > 0 ? (
            <span className={styles.impactPoint} key={`impact-${strikeId}`}>
              <span className={styles.impactCore} />
              <span className={styles.impactRing} />
              <span className={styles.impactRing} />
              <span className={styles.impactSpark} />
              <span className={styles.impactSpark} />
              <span className={styles.impactSpark} />
            </span>
          ) : null}

          <span
            className={`${styles.fish} ${strikeId > 0 ? styles.isStriking : ''}`}
            data-wood-grain={woodGrainStage}
            key={`fish-${strikeId}`}
          >
            <Image
              src="/muyu-clean.webp"
              alt=""
              width={860}
              height={672}
              priority
              draggable={false}
            />
            <span className={styles.woodGrain} aria-hidden="true">
              <svg viewBox="0 0 860 672" focusable="false">
                <g className={styles.woodGrainFirst}>
                  <path d="M214 108c25-15 62-12 87 3 17 10 28 25 34 40" />
                  <path d="M226 128c25-13 55-10 77 4 12 8 22 19 28 32" />
                  <path d="M245 145c22-7 45-1 60 13" />
                </g>
                <g className={styles.woodGrainSecond}>
                  <path d="M178 104c47-34 123-32 174 4 22 15 37 35 46 59" />
                  <path d="M184 138c40-27 104-27 150 3 19 12 32 29 39 49" />
                  <path d="M202 169c38-22 92-18 129 9 14 10 25 23 31 38" />
                </g>
                <g className={styles.woodGrainThird}>
                  <path d="M148 89c67-47 171-46 242 2 35 24 57 54 68 88" />
                  <path d="M151 166c47-37 119-38 172-8 28 16 48 39 60 66" />
                  <path d="M177 205c43-27 103-26 146 3 18 12 32 28 40 47" />
                </g>
              </svg>
            </span>
          </span>

          <span
            className={`${styles.mallet} ${malletMotionClass}`}
            key={`mallet-${strikeId}`}
          >
            <Image
              src="/muyu-mallet-clean.webp"
              alt=""
              width={900}
              height={320}
              priority
              draggable={false}
            />
          </span>

          {feedbacks.map((feedback) => (
            <span
              className={styles.feedback}
              key={feedback.id}
              style={{ '--feedback-offset': `${feedback.offset}px` } as CSSProperties}
            >
              +{feedback.value}
            </span>
          ))}

          {milestone ? (
            <span className={styles.meritMilestone} key={milestone.id}>
              阿弥陀佛
            </span>
          ) : null}
        </span>
      </button>

      <button
        className={styles.soundToggle}
        type="button"
        onClick={() => setSoundEnabled((current) => !current)}
        aria-label={soundEnabled ? '关闭木鱼声音' : '打开木鱼声音'}
        aria-pressed={soundEnabled}
        title={soundEnabled ? '关闭声音' : '打开声音'}
      >
        {soundEnabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
      </button>

      <span className={styles.liveStatus} aria-live="polite" aria-atomic="true">
        功德 {count}{milestone ? '，阿弥陀佛' : ''}
      </span>
    </div>
  )
}
