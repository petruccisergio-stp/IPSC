
export interface Devotional {
  id: string;
  day: number;
  month: string;
  monthIndex: number;
  year: number;
  title: string;
  verse: string;
  reference: string;
  content: string;
  truthCentral: string;
  prayer: string;
  reflection: string;
}

export interface FlipcardContent {
  id: string;
  category: string;
  title: string;
  question: string;
  answer: string;
  highlights: string[];
  visualHint?: string;
  biblicalRef?: string;
}

export interface PrayerRequest {
  id: string;
  author: string;
  text: string;
  count: number;
  date: string;
}

export interface ChurchEvent {
  id: string;
  title: string;
  date: Date;
  time: string;
  endTime?: string;
  location: string;
  description: string;
  color?: string;
  recurrence?: 'none' | 'daily' | 'weekly' | 'monthly';
  icon?: React.ReactNode;
}

export interface Hymn {
  number: number;
  title: string;
  lyrics: string;
}

export type AppView = 'home' | 'bible' | 'devotionals' | 'podcasts' | 'agenda' | 'prayer' | 'groups' | 'theology' | 'missionary_maps' | 'catechism' | 'manual';
