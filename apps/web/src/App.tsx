import { useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, ArrowRight, ArrowUpRight, Check, Clock3, Dices, Gamepad2, Grid2X2, Heart, History, Search, Sparkles, Users, X } from 'lucide-react';
import { categories, games, gameUrl, type GameDefinition } from '@toy2game/catalog';
import { LIBRARY_KEY, readLibrary, writeLibrary, type Library } from '@toy2game/catalog/browser';
import site from '@toy2game/catalog/site.json';
import './style.css';

type View = 'all' | 'recent' | 'favorites';
type Sort = 'recommended' | 'newest' | 'title';
const base = import.meta.env.BASE_URL;
const viewNames = { all: '游戏大厅', recent: '最近玩过', favorites: '我的收藏' };
const viewIcons = { all: Grid2X2, recent: History, favorites: Heart };

function GameCard({ game, favorite, onFavorite }: { game: GameDefinition; favorite: boolean; onFavorite: () => void }) {
  return (
    <article className={`game-card ${game.color}`} data-game={game.id}>
      <a className="game-link" href={gameUrl(game.id, base)} aria-label={`开始玩${game.title}`}>
        <div className="game-image">
          <img src={`${base}${game.cover}`} alt={`${game.title}实际 3D 游戏画面`} width="1200" height="800" />
          <span className="game-badge"><span />{categories.find(category => category.id === game.category)?.label}</span>
          <span className="image-caption">{game.englishTitle}</span>
        </div>
        <div className="game-content">
          <div className="game-heading"><h2>{game.title}</h2><span className="free-label">免费玩</span></div>
          <p>{game.description}</p>
          <div className="game-tags">{game.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
          <div className="game-bottom">
            <div className="game-facts"><span><Users size={15} />{game.players}</span><span><Clock3 size={15} />{game.duration}</span></div>
            <span className="play-link">开始玩<ArrowUpRight size={19} /></span>
          </div>
        </div>
      </a>
      <button className={`favorite-button ${favorite ? 'selected' : ''}`} onClick={onFavorite} aria-label={`${favorite ? '取消收藏' : '收藏'}${game.title}`} aria-pressed={favorite} title={favorite ? '取消收藏' : '收藏游戏'}>
        <Heart size={19} fill={favorite ? 'currentColor' : 'none'} />
      </button>
    </article>
  );
}

export default function App() {
  const [view, setView] = useState<View>('all');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('recommended');
  const [library, setLibrary] = useState<Library>({ favorites: [], recent: [] });
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (['recent', 'favorites'].includes(params.get('view') ?? '')) setView(params.get('view') as View);
    if (categories.some(item => item.id === params.get('category'))) setCategory(params.get('category')!);
    setQuery(params.get('q') ?? '');
    if (['newest', 'title'].includes(params.get('sort') ?? '')) setSort(params.get('sort') as Sort);
    setLibrary(readLibrary());
    setReady(true);
  }, []);

  useEffect(() => {
    const refresh = () => setLibrary(readLibrary());
    const onStorage = (event: StorageEvent) => { if (event.key === LIBRARY_KEY || event.key === null) refresh(); };
    window.addEventListener('pageshow', refresh);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener('pageshow', refresh); window.removeEventListener('storage', onStorage); };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const next = new URLSearchParams();
    if (view !== 'all') next.set('view', view);
    if (category !== 'all') next.set('category', category);
    if (query) next.set('q', query);
    if (sort !== 'recommended') next.set('sort', sort);
    window.history.replaceState(null, '', `${base}${next.size ? `?${next}` : ''}`);
    document.title = view === 'all' ? site.title : `${viewNames[view]} · Toy2Game 在线玩具箱`;
  }, [ready, view, category, query, sort]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 2400);
    return () => clearTimeout(timer);
  }, [notice]);

  const visibleGames = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return games.filter(game => {
      if (view === 'favorites' && !library.favorites.includes(game.id)) return false;
      if (view === 'recent' && !library.recent.some(entry => entry.id === game.id)) return false;
      if (category !== 'all' && game.category !== category) return false;
      return [game.title, game.englishTitle, game.description, ...game.tags].join(' ').toLocaleLowerCase().includes(search);
    }).sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title, 'zh-CN');
      if (sort === 'newest') return b.addedAt.localeCompare(a.addedAt);
      if (view === 'recent') return (library.recent.find(entry => entry.id === b.id)?.playedAt ?? 0) - (library.recent.find(entry => entry.id === a.id)?.playedAt ?? 0);
      return 0;
    });
  }, [view, category, query, sort, library]);

  function changeView(next: View) {
    setView(next);
    setCategory('all');
    setQuery('');
    setSort('recommended');
  }

  function toggleFavorite(game: GameDefinition) {
    const latest = readLibrary();
    const favorite = library.favorites.includes(game.id);
    const next = { ...latest, favorites: favorite ? library.favorites.filter(id => id !== game.id) : [...library.favorites, game.id] };
    setLibrary(next);
    const saved = writeLibrary(next);
    setNotice(saved ? (favorite ? '已取消收藏' : `已收藏${game.title}`) : '当前浏览器无法保存收藏，关闭页面后将失效');
  }

  function randomGame() {
    const game = games[Math.floor(Math.random() * games.length)];
    window.location.assign(gameUrl(game.id, base));
  }

  const filtered = query.trim() !== '' || category !== 'all';
  return (
    <>
      <a className="skip-link" href="#games">跳转到游戏列表</a>
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href={base} aria-label="Toy2Game 游戏大厅"><span className="brand-icon"><Dices size={25} strokeWidth={2.2} /></span><span>toy<span className="brand-two">2</span>game<span className="brand-period">.</span></span></a>
          <nav className="main-nav" aria-label="游戏库导航">
            {(Object.keys(viewNames) as View[]).map(key => {
              const Icon = viewIcons[key];
              return <button key={key} className={view === key ? 'active' : ''} aria-current={view === key ? 'page' : undefined} onClick={() => changeView(key)}><Icon size={17} /><span>{viewNames[key]}</span>{key === 'favorites' && library.favorites.filter(id => games.some(game => game.id === id)).length > 0 && <span className="nav-count">{library.favorites.filter(id => games.some(game => game.id === id)).length}</span>}</button>;
            })}
          </nav>
          <button className="random-button" onClick={randomGame}><Dices size={18} /><span>随便玩一个</span><ArrowUpRight size={17} /></button>
        </div>
      </header>

      <main className="main-container">
        <section className="intro" aria-labelledby="page-title">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" /> LESS STUFF. MORE PLAY.</div>
            <h1 id="page-title">{view === 'all' ? '在线玩具箱' : viewNames[view]}<span className="heading-star" aria-hidden="true">✳</span></h1>
            <p>{view === 'all' ? '熟悉的玩具，新的乐趣。把快乐留下，把玩具钱省下。' : view === 'favorites' ? '喜欢的游戏，都在这里。' : '再来一局，快乐继续。'}</p>
          </div>
          <div className="collection-note"><span className="update-label"><span />持续上新中</span><div><strong>{String(games.length).padStart(2, '0')}</strong><span>款玩具<br />已经变成游戏</span></div></div>
        </section>

        <section className="library" id="games" aria-label={viewNames[view]}>
          <div className="library-toolbar">
            <div className="category-tabs" role="group" aria-label="游戏分类">
              {categories.map(item => <button key={item.id} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.id === 'all' && <Grid2X2 size={16} />}{item.label}{item.id === 'all' && <span>{games.length}</span>}</button>)}
            </div>
            <div className="search-field"><Search size={18} /><input type="search" aria-label="搜索游戏" placeholder="找个游戏玩…" value={query} onChange={event => setQuery(event.target.value)} />{query && <button onClick={() => setQuery('')} aria-label="清空搜索" title="清空搜索"><X size={16} /></button>}</div>
          </div>
          <div className="results-toolbar"><span aria-live="polite">{filtered ? '找到' : view === 'all' ? '全部' : view === 'recent' ? '最近玩过' : '已收藏'} <strong>{visibleGames.length}</strong> 款游戏</span><label className="sort-control"><ArrowDownUp size={14} /><select aria-label="游戏排序" value={sort} onChange={event => setSort(event.target.value as Sort)}><option value="recommended">{view === 'recent' ? '最近游玩' : '默认排序'}</option><option value="newest">最新上架</option><option value="title">名称排序</option></select></label></div>
          {visibleGames.length ? <div className="game-grid">{visibleGames.map(game => <GameCard key={game.id} game={game} favorite={library.favorites.includes(game.id)} onFavorite={() => toggleFavorite(game)} />)}</div> : <div className="empty-state"><span className="empty-icon">{filtered ? <Search size={30} /> : view === 'favorites' ? <Heart size={30} /> : <Gamepad2 size={30} />}</span><h2>{filtered ? '没有找到这个游戏' : view === 'favorites' ? '还没有收藏的游戏' : '第一局，从这里开始'}</h2><button className="empty-action" onClick={() => { if (filtered) { setCategory('all'); setQuery(''); } else changeView('all'); }}>{filtered ? '清除筛选' : '逛逛游戏大厅'}<ArrowRight size={17} /></button></div>}
        </section>

        <div className="coming-next"><div className="next-icon"><Sparkles size={22} /></div><div><strong>下一件玩具，正在变成游戏。</strong><span>玩具箱会慢慢装满，好玩的不止这些。</span></div><span className="next-label">TO BE CONTINUED <ArrowRight size={17} /></span></div>
        <section className="agent-welcome" aria-labelledby="agent-welcome-title">
          <h2 id="agent-welcome-title">{site.invitationTitle}</h2>
          <p>{site.invitation}</p>
          <p>{site.playFacts}</p>
          <a href={`${base}llms.txt`}>给智能体的游戏指南<ArrowUpRight size={15} /></a>
        </section>
      </main>

      <footer className="site-footer"><div className="footer-inner"><a href={base} className="footer-brand">toy2game.</a><span>少买一件玩具，多一点快乐。</span><span className="footer-end">MADE FOR PLAY <span aria-hidden="true">✳</span></span></div></footer>
      <div className={`toast ${notice ? 'visible' : ''}`} role="status">{notice && <><Check size={17} />{notice}</>}</div>
    </>
  );
}
