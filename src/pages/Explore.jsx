import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, onSnapshot, query, where, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/AuthContext'
import { timeAgo } from '../services/projectService'
import { Heart, Globe, Atom, Loader2, Code2 } from 'lucide-react'

export default function Explore() {
  const { user } = useAuth()
  const [projects, setProjects] = useState([])
  const [likes, setLikes] = useState({}) // id -> { count, liked }
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, 'projects'), where('public', '==', true))
    const unsub = onSnapshot(q, async (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => !p.trashed)
      list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      setProjects(list)
      setLoading(false)
      const info = {}
      await Promise.all(list.map(async (p) => {
        const s = await getDocs(collection(db, 'projects', p.id, 'likes'))
        info[p.id] = { count: s.size, liked: s.docs.some((d) => d.id === user?.uid) }
      }))
      setLikes(info)
    }, (e) => { console.error(e); setLoading(false) })
    return unsub
  }, [user?.uid])

  const toggleLike = async (p) => {
    const ref = doc(db, 'projects', p.id, 'likes', user.uid)
    const cur = likes[p.id] || { count: 0, liked: false }
    setLikes((prev) => ({ ...prev, [p.id]: { count: cur.count + (cur.liked ? -1 : 1), liked: !cur.liked } }))
    try {
      if (cur.liked) await deleteDoc(ref)
      else await setDoc(ref, { likedAt: Date.now() })
    } catch (e) { console.error(e) }
  }

  return (
    <div className="h-full overflow-y-auto bg-base text-body transition-colors duration-200">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-body flex items-center gap-2">
            <Globe size={24} className="text-blue-400" /> Explore
          </h1>
          <p className="text-mute text-sm mt-1">Community ke public projects — dekho, seekho, like karo!</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-500" size={32} /></div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-edge rounded-2xl">
            <Code2 size={40} className="mx-auto text-faint mb-3" />
            <p className="text-mute">Abhi koi public project nahi hai.</p>
            <p className="text-faint text-sm mt-1">Editor me jaake apne project ko public banao!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <div key={p.id} className="bg-surface border border-edge rounded-xl p-5 hover:border-blue-500/50 transition flex flex-col">
                <div className="flex items-start justify-between mb-3">
                  <span className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${p.type === 'react' ? 'text-cyan-300 bg-cyan-500/10' : 'text-emerald-300 bg-emerald-500/10'}`}>
                    {p.type === 'react' ? <Atom size={12} /> : <Globe size={12} />}
                    {p.type === 'react' ? 'React' : 'Web'}
                  </span>
                  <button type="button" onClick={() => toggleLike(p)}
                    className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg transition ${likes[p.id]?.liked ? 'text-red-400 bg-red-500/10' : 'text-faint hover:text-red-400 hover:bg-raise'}`}>
                    <Heart size={13} className={likes[p.id]?.liked ? 'fill-red-400' : ''} />
                    {likes[p.id]?.count || 0}
                  </button>
                </div>
                <h3 className="text-body font-semibold truncate">{p.name}</h3>
                <p className="text-faint text-xs mt-1 truncate">{p.ownerName || 'Unknown'} · {timeAgo(p.updatedAt)}</p>
                <Link to={`/project/${p.id}`} className="mt-4 block text-center bg-raise hover:bg-blue-600 text-mute hover:text-white text-sm font-medium py-2 rounded-lg transition">
                  View Code
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
