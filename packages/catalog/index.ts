import entries from './games.json';

export const categories = [
  { id: 'all', label: '全部游戏' },
  { id: 'party', label: '欢乐派对' },
  { id: 'strategy', label: '策略棋盘' },
] as const;

export type Category = Exclude<typeof categories[number]['id'], 'all'>;
export type GameDefinition = {
  id: string;
  title: string;
  englishTitle: string;
  description: string;
  category: Category;
  tags: string[];
  players: string;
  duration: string;
  cover: string;
  color: 'ice' | 'garden';
  addedAt: string;
  seo: {
    title: string;
    description: string;
    recommendation: string;
    rules: string[];
    controls: string[];
  };
};

export const games = entries as GameDefinition[];
export const gameUrl = (id: string, base = '/') => `${base}games/${id}/`;
