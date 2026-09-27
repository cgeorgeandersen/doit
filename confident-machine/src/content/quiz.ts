/**
 * Chapter 2 calibration questions. Two options each, so 50% confidence means
 * "coin flip". Chosen to mix easy questions with genuine surprises (see the
 * hard–easy effect in the chapter's "Go deeper" panel).
 */
export interface QuizQuestion {
  id: string;
  prompt: string;
  options: [string, string];
  answer: 0 | 1;
  explanation: string;
  sources: string[];
}

export const QUIZ: QuizQuestion[] = [
  {
    id: 'ocean',
    prompt: 'Which ocean is larger?',
    options: ['The Pacific', 'The Atlantic'],
    answer: 0,
    explanation: 'The Pacific covers about 155 million square kilometres and holds more than half of Earth’s free water.',
    sources: ['noaa-pacific'],
  },
  {
    id: 'rome',
    prompt: 'Which city is farther north?',
    options: ['Rome', 'New York City'],
    answer: 0,
    explanation: 'Rome sits at about 41.9° N; New York City at about 40.7° N. Europe’s mild climate makes it feel farther south than it is.',
    sources: ['geonames-rome', 'geonames-nyc'],
  },
  {
    id: 'hottest',
    prompt: 'Which planet has the hotter surface?',
    options: ['Mercury', 'Venus'],
    answer: 1,
    explanation: 'Venus, though it is farther from the Sun. Its thick carbon-dioxide atmosphere traps heat, making it the hottest planet in the solar system.',
    sources: ['nasa-venus'],
  },
  {
    id: 'cleopatra',
    prompt: 'Cleopatra lived closer in time to…',
    options: ['The building of the Great Pyramid', 'The Moon landing'],
    answer: 1,
    explanation: 'She died in 30 BCE. The Great Pyramid was built around 2560 BCE, about 2,500 years earlier; Apollo 11 landed about 2,000 years later.',
    sources: ['ocd-cleopatra', 'whe-pyramid', 'nasa-apollo11'],
  },
  {
    id: 'jupiter',
    prompt: 'Which is the largest planet in our solar system?',
    options: ['Saturn', 'Jupiter'],
    answer: 1,
    explanation: 'Jupiter. NASA’s comparison: if it were a hollow shell, about 1,000 Earths could fit inside.',
    sources: ['nasa-jupiter'],
  },
  {
    id: 'fax',
    prompt: 'Which was invented first?',
    options: ['The telephone', 'The fax machine'],
    answer: 1,
    explanation: 'The fax. Alexander Bain patented an image-transmitting telegraph in 1843; Alexander Graham Bell’s telephone patent came in 1876.',
    sources: ['ethw-fax', 'loc-telephone'],
  },
  {
    id: 'moon',
    prompt: 'How many Earths could fit side by side in the gap between Earth and the Moon?',
    options: ['About 30', 'About 300'],
    answer: 0,
    explanation: 'About 30. The Moon averages 384,400 km away, and NASA puts it plainly: 30 Earth-sized planets could fit in between.',
    sources: ['nasa-moon'],
  },
  {
    id: 'oxford',
    prompt: 'Which is older?',
    options: ['The University of Oxford', 'The Aztec city of Tenochtitlan'],
    answer: 0,
    explanation: 'Oxford. Teaching existed there in some form by 1096; Tenochtitlan was founded around 1325.',
    sources: ['oxford-history', 'britannica-tenochtitlan'],
  },
  {
    id: 'mercury',
    prompt: 'Averaged over time, which planet is closest to Earth?',
    options: ['Venus', 'Mercury'],
    answer: 1,
    explanation: 'Mercury. Venus comes closest at its nearest, but it spends long stretches on the far side of the Sun. On average Mercury is about 1.04 astronomical units away and Venus about 1.14.',
    sources: ['physics-today-mercury'],
  },
  {
    id: 'trees',
    prompt: 'Which are there more of?',
    options: ['Trees on Earth', 'Stars in the Milky Way'],
    answer: 0,
    explanation: 'Trees: about 3 trillion, against an estimated 100 to 400 billion stars in our galaxy.',
    sources: ['crowther-2015', 'nasa-milkyway'],
  },
];

export const QUIZ_SOURCES = [...new Set(QUIZ.flatMap((q) => q.sources))];
