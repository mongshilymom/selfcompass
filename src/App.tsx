import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createClient, Session } from '@supabase/supabase-js'
import { toPng } from 'html-to-image'
import {
  Chart as ChartJS,
  LineElement, BarElement, PointElement,
  LinearScale, CategoryScale,
  Tooltip, Legend,
} from 'chart.js'
import { Line, Bar } from 'react-chartjs-2'

ChartJS.register(LineElement, BarElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend)

// ---------- Supabase ----------
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ---------- Types ----------
type Dimension = 'E' | 'I' | 'L' | 'F' | 'A' | 'C'

type Question = {
  id: number
  text: string
  dims: Partial<Record<Dimension, number>> // weights (positive adds to that dim)
}

type Scores = Record<Dimension, number>

type TypeKey = 'ELA' | 'ELF' | 'ECA' | 'ECF' | 'ILA' | 'ILF' | 'ICA' | 'ICF'

// ---------- Questions (12) ----------
const QUESTIONS: Question[] = [
  { id: 1, text: '모르는 사람 많은 자리에 가면 에너지가 충전된다.', dims: { E: 1 } },
  { id: 2, text: '계획 없는 주말이 설렌다. 즉흥이 재밌다.', dims: { E: 1, A: 1 } },
  { id: 3, text: '논리적 일관성이 감정보다 우선이다.', dims: { L: 1 } },
  { id: 4, text: '대화에서 분위기/표정을 먼저 읽는다.', dims: { F: 1, C: 1 } },
  { id: 5, text: '혼자 몰입하면 성과가 가장 좋다.', dims: { I: 1, A: 1 } },
  { id: 6, text: '완벽하진 않아도 빨리 출시가 낫다.', dims: { E: 1, A: 1, L: 1 } },
  { id: 7, text: '배려하느라 내 의견을 접는 편이다.', dims: { F: 1, C: 1 } },
  { id: 8, text: '규칙·체계가 있으면 더 편하다.', dims: { C: 1, I: 1 } },
  { id: 9, text: '갈등이 생기면 데이터와 사례로 정리한다.', dims: { L: 1, I: 1 } },
  { id: 10, text: '새 아이디어가 떠오르면 일단 시도부터 한다.', dims: { E: 1, A: 1 } },
  { id: 11, text: '중요한 선택에서 “내 마음이 편한가”를 본다.', dims: { F: 1 } },
  { id: 12, text: '주변을 챙기고 연결하는 역할을 자주 맡는다.', dims: { C: 1, E: 1 } },
]

const DIM_LIST: Dimension[] = ['E', 'I', 'L', 'F', 'A', 'C']
const MAX_PER_QUESTION = 4 // answer 1..5 → (ans-1) ranges 0..4, we sum weights * (ans-1)
const DIM_MAX: Scores = DIM_LIST.reduce((acc, d) => {
  const hits = QUESTIONS.reduce((n, q) => n + (q.dims[d] ? 1 : 0), 0)
  acc[d] = hits * MAX_PER_QUESTION
  return acc
}, { E: 0, I: 0, L: 0, F: 0, A: 0, C: 0 } as Scores)

const TYPE_META: Record<TypeKey, {
  name: string; emoji: string; oneLine: string; strengths: string[]; caution: string;
  bestMatch: TypeKey; hashtags: string[];
}> = {
  ELA: {
    name: '스파크 메이커', emoji: '⚡️', oneLine: '사람 속에서 번뜩임을 터뜨리는 시동 장치',
    strengths: ['실행 속도', '네트워킹', '초기 모멘텀'], caution: '과열 주의 — 루틴으로 리듬 만들기',
    bestMatch: 'ICF', hashtags: ['#나침반유형', '#스파크메이커']
  },
  ELF: {
    name: '파티 큐레이터', emoji: '🎉', oneLine: '분위기를 조율해 팀 에너지를 끌어올린다',
    strengths: ['분위기 감각', '연결 능력', '시작의 즐거움'], caution: '딜리버리 마감 주의',
    bestMatch: 'ILA', hashtags: ['#파티큐레이터']
  },
  ECA: {
    name: '프런티어 파일럿', emoji: '🛩️', oneLine: '규칙 위에서 속도를 뽑아내는 개척 조종사',
    strengths: ['조직화된 실행', '리스크 관리', '리드십'], caution: '융통성 잃지 않기',
    bestMatch: 'ILF', hashtags: ['#프런티어파일럿']
  },
  ECF: {
    name: '팀 하모나이저', emoji: '🧩', oneLine: '사람을 엮어 합을 올리는 분위기 조정자',
    strengths: ['조정력', '서포트', '관계 유지'], caution: '의견 희석 경계',
    bestMatch: 'ILA', hashtags: ['#팀하모나이저']
  },
  ILA: {
    name: '솔로 아키텍트', emoji: '🧠', oneLine: '깊게 설계하고 조용히 완성하는 구조가 천직',
    strengths: ['집중', '논리', '설계'], caution: '공유·협업 타이밍 잡기',
    bestMatch: 'ECF', hashtags: ['#솔로아키텍트']
  },
  ILF: {
    name: '사색 프로듀서', emoji: '🌙', oneLine: '깊은 공감과 미감을 결과로 옮기는 창작자',
    strengths: ['공감', '감수성', '표현'], caution: '완성·출시 리듬',
    bestMatch: 'ECA', hashtags: ['#사색프로듀서']
  },
  ICA: {
    name: '딥다이버 해커', emoji: '🧪', oneLine: '혼자 파고들어 시스템을 재발명하는 실험러',
    strengths: ['집요함', '문제해결', '자동화'], caution: '사일로·완벽주의 경계',
    bestMatch: 'ELF', hashtags: ['#딥다이버해커']
  },
  ICF: {
    name: '정원사 플래너', emoji: '🌿', oneLine: '관계와 시스템을 다져 1→N을 키우는 성장 관리자',
    strengths: ['루틴', '배려', '지속 성장'], caution: '초기 속도·결단 강화',
    bestMatch: 'ELA', hashtags: ['#정원사플래너']
  },
}

const clamp = (v: number, min = 0, max = 10) => Math.max(min, Math.min(max, v))

function normalizeScores(raw: Scores): Scores {
  const out: Scores = { E: 0, I: 0, L: 0, F: 0, A: 0, C: 0 }
  for (const d of DIM_LIST) {
    const max = DIM_MAX[d] || 1
    out[d] = clamp((raw[d] / max) * 10)
  }
  return out
}

function typeFromScores(s: Scores): TypeKey {
  const e = s.E >= s.I ? 'E' : 'I'
  const l = s.L >= s.F ? 'L' : 'F'
  const a = s.A >= s.C ? 'A' : 'C'
  return (e + l + a) as TypeKey
}

function todayISODate() {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

// ---------- Supabase events ----------
async function ensureAnonSession(): Promise<Session | null> {
  const { data: sessionData } = await supabase.auth.getSession()
  if (sessionData.session) return sessionData.session
  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) {
    console.error('Anon sign-in error', error.message)
    return null
  }
  return data.session
}

async function logEvent(type: string, payload?: any, minutes?: number) {
  try {
    const { data: user } = await supabase.auth.getUser()
    const user_id = user.user?.id || null
    const occurred_at = new Date().toISOString()
    await supabase.from('events').insert([{ type, payload, minutes, user_id, occurred_at }])
  } catch (e) {
    console.warn('logEvent failed', e)
  }
}

// ---------- Layout ----------
const PageShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen w-full bg-gradient-to-b from-slate-50 to-white text-slate-900">
    <div className="max-w-xl mx-auto px-5 py-8">
      <header className="flex items-center justify-between mb-6">
        <div className="text-2xl font-bold">🧭 마음나침반</div>
        <div className="text-xs opacity-60">MVP • {todayISODate()}</div>
      </header>
      <div className="rounded-2xl shadow p-5 bg-white">{children}</div>
      <footer className="py-8 text-center text-xs text-slate-400">© MindQuiz • MVP</footer>
    </div>
  </div>
)

const Progress: React.FC<{ step: number; total: number }> = ({ step, total }) => {
  const p = Math.round((step / total) * 100)
  return (
    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mb-4">
      <div className="h-2 bg-slate-900" style={{ width: `${p}%` }} />
    </div>
  )
}

// ---------- App ----------
export default function App() {
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState<'quiz' | 'result' | 'admin'>('quiz')
  const [answers, setAnswers] = useState<Record<number, number>>({}) // 1..5
  const [startAt, setStartAt] = useState<number>(Date.now())

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('admin') === '1') setMode('admin')
    ;(async () => {
      await ensureAnonSession()
      setReady(true)
      if (sp.get('admin') !== '1') {
        setStartAt(Date.now())
        logEvent('quiz_start')
      }
    })()
  }, [])

  if (!ready) return <PageShell><div>로딩 중…</div></PageShell>

  return (
    <PageShell>
      {mode === 'quiz' && (
        <QuizView
          answers={answers}
          setAnswers={setAnswers}
          onComplete={() => setMode('result')}
          startAt={startAt}
        />
      )}
      {mode === 'result' && (
        <ResultView answers={answers} onRestart={() => {
          setAnswers({}); setStartAt(Date.now()); setMode('quiz'); logEvent('quiz_start')
        }} />
      )}
      {mode === 'admin' && (
        <AdminView />
      )}
    </PageShell>
  )
}

// ---------- Quiz View ----------
const QuizView: React.FC<{
  answers: Record<number, number>;
  setAnswers: (a: Record<number, number>) => void;
  onComplete: (ok: boolean) => void;
  startAt: number;
}> = ({ answers, setAnswers, onComplete, startAt }) => {
  const [index, setIndex] = useState(0)
  const total = QUESTIONS.length
  const current = QUESTIONS[index]

  const setAnswer = (qid: number, val: number) => {
    const next = { ...answers, [qid]: val }
    setAnswers(next)
  }

  const next = async () => {
    if (index < total - 1) {
      setIndex(index + 1)
    } else {
      const { typeKey, scores } = computeResult(answers)
      const minutes = Math.max(0.1, (Date.now() - startAt) / 60000)
      await logEvent('quiz_complete', { typeKey, scores, answers }, minutes)
      onComplete(true)
    }
  }

  return (
    <div>
      <div className="text-sm mb-1 text-slate-500">30초 만에 내 마음의 방향 잡기</div>
      <h1 className="text-xl font-bold mb-3">Q{index + 1}. {current.text}</h1>
      <Progress step={index} total={total} />
      <div className="grid grid-cols-5 gap-2 my-4">
        {[1,2,3,4,5].map(v => (
          <button key={v}
            onClick={() => setAnswer(current.id, v)}
            className={
              'py-3 rounded-xl border text-sm ' +
              (answers[current.id] === v
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white hover:bg-slate-50 border-slate-200')
            }>{v === 1 ? '전혀 아님' : v === 5 ? '매우 그럼' : v}</button>
        ))}
      </div>
      <div className="flex items-center justify-between mt-6">
        <div className="text-xs text-slate-500">문항 {index + 1}/{total}</div>
        <button
          disabled={!answers[current.id]}
          onClick={next}
          className={'px-4 py-2 rounded-xl text-white ' + (!answers[current.id] ? 'bg-slate-300' : 'bg-slate-900 hover:opacity-90')}
        >{index === total - 1 ? '결과 보기' : '다음'}</button>
      </div>
    </div>
  )
}

// ---------- Result View ----------
const ResultView: React.FC<{ answers: Record<number, number>; onRestart: () => void }>
= ({ answers, onRestart }) => {
  const { typeKey, scores } = useMemo(() => computeResult(answers), [answers])
  const meta = TYPE_META[typeKey]
  const cardRef = useRef<HTMLDivElement>(null)
  const [sharing, setSharing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const shareText = `I'm ${typeKey} ${meta.name}. 너는 뭐 나왔어? #마음나침반`
  const url = typeof window !== 'undefined' ? window.location.origin : ''

  const downloadCard = async () => {
    if (!cardRef.current) return
    const dataUrl = await toPng(cardRef.current)
    const a = document.createElement('a')
    a.href = dataUrl; a.download = `SelfCompass_${typeKey}.png`; a.click()
  }

  const share = async () => {
    setSharing(true)
    try {
      await logEvent('share_click', { platform: (navigator as any).share ? 'web_share' : 'copy' })
      if ((navigator as any).share && cardRef.current) {
        const dataUrl = await toPng(cardRef.current)
        const res = await fetch(dataUrl)
        const blob = await res.blob()
        const file = new File([blob], `SelfCompass_${typeKey}.png`, { type: 'image/png' })
        await (navigator as any).share({ title: '마음나침반', text: shareText, url, files: [file] })
      } else {
        await navigator.clipboard.writeText(f"{shareText} {url}")
        setToast('캡션+링크가 복사되었습니다!')
      }
      await logEvent('share_success', { typeKey })
    } catch (e) {
      console.warn(e)
      setToast('공유가 취소되었어요.')
    } finally {
      setSharing(false)
      setTimeout(() => setToast(null), 2000)
    }
  }

  return (
    <div>
      <div ref={cardRef} className="rounded-2xl border border-slate-200 p-5 bg-white">
        <div className="text-xs text-slate-500 mb-2">나는…</div>
        <div className="text-3xl font-extrabold mb-1">{meta.emoji} {meta.name} <span className="text-slate-400 text-xl">({typeKey})</span></div>
        <div className="text-slate-600 mb-4">{meta.oneLine}</div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="font-semibold mb-1">강점</div>
            <ul className="list-disc pl-5">
              {meta.strengths.map(s => <li key={s}>{s}</li>)}
            </ul>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="font-semibold mb-1">주의</div>
            <div>{meta.caution}</div>
          </div>
        </div>
        <div className="mt-4 text-xs text-slate-500">찰떡 파트너: <b>{TYPE_META[meta.bestMatch].name}</b> ({meta.bestMatch})</div>
        <div className="mt-2 text-xs text-slate-400">{meta.hashtags.join(' ')}</div>
      </div>

      <div className="mt-5 flex gap-2">
        <button onClick={share} disabled={sharing}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white">결과 공유</button>
        <button onClick={downloadCard} className="px-4 py-2 rounded-xl border">카드 PNG 저장</button>
        <button onClick={onRestart} className="px-4 py-2 rounded-xl border">다시 하기</button>
      </div>

      {toast && <div className="mt-3 text-sm text-emerald-600">{toast}</div>}

      <div className="mt-8">
        <h3 className="font-semibold mb-2">내 점수</h3>
        <Line data={{
          labels: ['E','I','L','F','A','C'],
          datasets: [{ label: '점수(0-10)', data: [scores.E, scores.I, scores.L, scores.F, scores.A, scores.C], borderWidth: 2 }]
        }} />
      </div>

      <div className="mt-8 rounded-xl bg-slate-50 p-4 text-xs text-slate-500">
        본 결과는 자기이해를 돕기 위한 엔터테인먼트입니다.
      </div>
    </div>
  )
}

// ---------- Admin View (7-day stats) ----------
const AdminView: React.FC = () => {
  const [rows, setRows] = useState<{ day: string; quiz_complete: number; share_click: number; purchase_success: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.rpc('stats_last_7_days')
        if (error) throw error
        setRows(data as any)
      } catch (e) {
        console.warn('RPC failed, fallback to client aggregation', e)
        const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
        const { data } = await supabase.from('events').select('occurred_at,type').gte('occurred_at', since)
        const map = new Map<string, { qc: number; sc: number; ps: number }>()
        const days: string[] = []
        for (let i = 6; i >= 0; i--) {
          const d = new Date(Date.now() - i * 24 * 3600 * 1000).toISOString().slice(0, 10)
          days.push(d); map.set(d, { qc: 0, sc: 0, ps: 0 })
        }
        ;(data || []).forEach((e: any) => {
          const day = e.occurred_at.slice(0, 10)
          if (!map.has(day)) return
          const r = map.get(day)!
          const t = e.type as string
          if (t === 'quiz_complete') r.qc++
          if (t === 'share_click') r.sc++
          if (t === 'purchase_success') r.ps++
        })
        const out = days.map(d => ({ day: d, quiz_complete: map.get(d)!.qc, share_click: map.get(d)!.sc, purchase_success: map.get(d)!.ps }))
        setRows(out)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  if (loading) return <div>집계 불러오는 중…</div>

  const labels = rows.map(r => r.day.slice(5))
  const quizData = rows.map(r => r.quiz_complete)
  const shareData = rows.map(r => r.share_click)
  const purchData = rows.map(r => r.purchase_success)

  return (
    <div>
      <div className="text-lg font-bold mb-4">📊 Admin — 최근 7일</div>
      <div className="grid gap-6">
        <div>
          <div className="font-semibold mb-2">퀴즈 완료</div>
          <Line data={{ labels, datasets: [{ label: 'quiz_complete', data: quizData }] }} />
        </div>
        <div>
          <div className="font-semibold mb-2">공유 클릭</div>
          <Line data={{ labels, datasets: [{ label: 'share_click', data: shareData }] }} />
        </div>
        <div>
          <div className="font-semibold mb-2">구매 성공(데모)</div>
          <Bar data={{ labels, datasets: [{ label: 'purchase_success', data: purchData }] }} />
        </div>
      </div>
      <div className="mt-6 text-xs text-slate-500">RPC가 설정되면 익명 키로도 안전하게 집계됩니다.</div>
    </div>
  )
}

// ---------- Compute result ----------
function computeResult(answers: Record<number, number>): { typeKey: TypeKey; scores: Scores } {
  const raw: Scores = { E: 0, I: 0, L: 0, F: 0, A: 0, C: 0 }
  for (const q of QUESTIONS) {
    const ans = answers[q.id]
    if (!ans) continue
    const adj = Math.max(0, Math.min(4, ans - 1)) // 0..4
    for (const d in q.dims) {
      const dim = d as Dimension
      raw[dim] += adj * (q.dims[dim] || 1)
    }
  }
  const scores = normalizeScores(raw)
  const typeKey = typeFromScores(scores)
  return { typeKey, scores }
}
