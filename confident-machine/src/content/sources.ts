/**
 * Static sources: published research, court decisions, official pages.
 * Time-sensitive claims live in timely.json instead, with their own sources
 * and "last checked" dates. Cite either kind in the HTML with data-cite="id"
 * (timely entries as data-cite="timely:id").
 */
export interface Source {
  title: string;
  by?: string;
  publisher?: string;
  date: string;
  url?: string;
  note?: string;
}

export const SOURCES: Record<string, Source> = {
  // Opening
  'bard-demo': {
    by: 'Sundar Pichai',
    title: 'An important next step on our AI journey (launch post and demo video)',
    publisher: 'Google',
    date: 'Feb. 6, 2023',
    url: 'https://blog.google/technology/ai/bard-google-ai-search-updates/',
    note: "Bard's answer is transcribed from the demo video in this post.",
  },
  'verge-bard': {
    by: 'James Vincent',
    title: "Google's AI chatbot Bard makes factual error in first demo",
    publisher: 'The Verge',
    date: 'Feb. 8, 2023',
    url: 'https://www.theverge.com/2023/2/8/23590864/google-ai-chatbot-bard-mistake-error-exoplanet-demo',
  },
  'nasa-webb-exoplanet': {
    by: 'NASA Webb Mission Team',
    title: "NASA's Webb Takes Its First-Ever Direct Image of Distant World",
    publisher: 'NASA',
    date: 'Sept. 1, 2022',
    url: 'https://science.nasa.gov/blogs/webb/2022/09/01/nasas-webb-takes-its-first-ever-direct-image-of-distant-world/',
  },
  'nasa-2m1207': {
    title: '2M1207 b: First image of an exoplanet',
    publisher: 'NASA Science',
    date: '2004 image',
    url: 'https://science.nasa.gov/resource/2m1207-b-first-image-of-an-exoplanet/',
  },
  'nbc-webb': {
    title: "NASA's James Webb telescope snaps its first picture of an exoplanet",
    publisher: 'NBC News',
    date: 'Sept. 1, 2022',
    url: 'https://www.nbcnews.com/science/space/nasas-james-webb-telescope-snaps-first-picture-exoplanet-rcna45907',
  },
  'cnn-alphabet': {
    title: "Google shares lose $100 billion after company's AI chatbot makes an error during demo",
    publisher: 'CNN Business',
    date: 'Feb. 8, 2023',
    url: 'https://www.cnn.com/2023/02/08/tech/google-ai-bard-demo-error',
  },

  // Chapter 1
  'shannon-1948': {
    by: 'Claude E. Shannon',
    title: 'A Mathematical Theory of Communication',
    publisher: 'Bell System Technical Journal 27',
    date: '1948',
    url: 'https://people.math.harvard.edu/~ctm/home/text/others/shannon/entropy/entropy.pdf',
  },
  'gpt4-report': {
    by: 'OpenAI',
    title: 'GPT-4 Technical Report',
    publisher: 'arXiv:2303.08774',
    date: '2023',
    url: 'https://arxiv.org/abs/2303.08774',
  },
  llama3: {
    by: 'Meta',
    title: 'Introducing Meta Llama 3: The most capable openly available LLM to date',
    publisher: 'Meta AI',
    date: 'Apr. 18, 2024',
    url: 'https://ai.meta.com/blog/meta-llama-3/',
  },
  instructgpt: {
    by: 'Long Ouyang et al.',
    title: 'Training language models to follow instructions with human feedback',
    publisher: 'NeurIPS',
    date: '2022',
    url: 'https://arxiv.org/abs/2203.02155',
  },
  'holtzman-2020': {
    by: 'Ari Holtzman et al.',
    title: 'The Curious Case of Neural Text Degeneration',
    publisher: 'ICLR',
    date: '2020',
    url: 'https://arxiv.org/abs/1904.09751',
  },
  'vaswani-2017': {
    by: 'Ashish Vaswani et al.',
    title: 'Attention Is All You Need',
    publisher: 'NeurIPS',
    date: '2017',
    url: 'https://arxiv.org/abs/1706.03762',
  },
  'gpt2-2019': {
    by: 'Alec Radford et al.',
    title: 'Language Models are Unsupervised Multitask Learners',
    publisher: 'OpenAI',
    date: '2019',
    url: 'https://cdn.openai.com/better-language-models/language_models_are_unsupervised_multitask_learners.pdf',
  },
  'sennrich-2016': {
    by: 'Rico Sennrich, Barry Haddow & Alexandra Birch',
    title: 'Neural Machine Translation of Rare Words with Subword Units',
    publisher: 'ACL',
    date: '2016',
    url: 'https://arxiv.org/abs/1508.07909',
  },
  'witten-bell-1991': {
    by: 'Ian H. Witten & Timothy C. Bell',
    title: 'The zero-frequency problem: estimating the probabilities of novel events in adaptive text compression',
    publisher: 'IEEE Transactions on Information Theory 37(4)',
    date: '1991',
    url: 'https://doi.org/10.1109/18.87000',
  },
  'gutenberg-alice': {
    by: 'Lewis Carroll',
    title: "Alice's Adventures in Wonderland (1865)",
    publisher: 'Project Gutenberg eBook #11',
    date: 'public domain',
    url: 'https://www.gutenberg.org/ebooks/11',
  },
  'gutenberg-pride': {
    by: 'Jane Austen',
    title: 'Pride and Prejudice (1813)',
    publisher: 'Project Gutenberg eBook #1342',
    date: 'public domain',
    url: 'https://www.gutenberg.org/ebooks/1342',
  },
  'gutenberg-holmes': {
    by: 'Arthur Conan Doyle',
    title: 'The Adventures of Sherlock Holmes (1892)',
    publisher: 'Project Gutenberg eBook #1661',
    date: 'public domain',
    url: 'https://www.gutenberg.org/ebooks/1661',
  },

  // Chapter 2
  'brier-1950': {
    by: 'Glenn W. Brier',
    title: 'Verification of forecasts expressed in terms of probability',
    publisher: 'Monthly Weather Review 78(1)',
    date: '1950',
    url: 'https://doi.org/10.1175/1520-0493(1950)078%3C0001:VOFEIT%3E2.0.CO;2',
  },
  'lichtenstein-1977': {
    by: 'Sarah Lichtenstein & Baruch Fischhoff',
    title: 'Do those who know more also know more about how much they know?',
    publisher: 'Organizational Behavior and Human Performance 20(2)',
    date: '1977',
    url: 'https://doi.org/10.1016/0030-5073(77)90001-0',
  },
  'kadavath-2022': {
    by: 'Saurav Kadavath et al.',
    title: 'Language Models (Mostly) Know What They Know',
    publisher: 'arXiv:2207.05221',
    date: '2022',
    url: 'https://arxiv.org/abs/2207.05221',
  },
  'xiong-2024': {
    by: 'Miao Xiong et al.',
    title: 'Can LLMs Express Their Uncertainty? An Empirical Evaluation of Confidence Elicitation in LLMs',
    publisher: 'ICLR',
    date: '2024',
    url: 'https://arxiv.org/abs/2306.13063',
  },
  'steyvers-2025': {
    by: 'Mark Steyvers et al.',
    title: 'What large language models know and what people think they know',
    publisher: 'Nature Machine Intelligence 7',
    date: '2025',
    url: 'https://www.nature.com/articles/s42256-024-00976-7',
  },
  'kalai-2025': {
    by: 'Adam Tauman Kalai, Ofir Nachum, Santosh S. Vempala & Edwin Zhang',
    title: 'Why Language Models Hallucinate',
    publisher: 'arXiv:2509.04664',
    date: 'Sept. 2025',
    url: 'https://arxiv.org/abs/2509.04664',
  },
  'sharma-2023': {
    by: 'Mrinank Sharma et al.',
    title: 'Towards Understanding Sycophancy in Language Models',
    publisher: 'ICLR 2024',
    date: '2023',
    url: 'https://arxiv.org/abs/2310.13548',
  },
  'shuster-2021': {
    by: 'Kurt Shuster et al.',
    title: 'Retrieval Augmentation Reduces Hallucination in Conversation',
    publisher: 'Findings of EMNLP',
    date: '2021',
    url: 'https://arxiv.org/abs/2104.07567',
  },
  'lewis-2020': {
    by: 'Patrick Lewis et al.',
    title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks',
    publisher: 'NeurIPS',
    date: '2020',
    url: 'https://arxiv.org/abs/2005.11401',
  },
  'dhuliawala-2023': {
    by: 'Shehzaad Dhuliawala et al.',
    title: 'Chain-of-Verification Reduces Hallucination in Large Language Models',
    publisher: 'arXiv:2309.11495',
    date: '2023',
    url: 'https://arxiv.org/abs/2309.11495',
  },
  'magesh-2024': {
    by: 'Varun Magesh et al.',
    title: 'Hallucination-Free? Assessing the Reliability of Leading AI Legal Research Tools',
    publisher: 'Stanford RegLab / HAI, arXiv:2405.20362',
    date: '2024',
    url: 'https://arxiv.org/abs/2405.20362',
  },
  'mata-avianca': {
    title: 'Mata v. Avianca, Inc., No. 1:22-cv-01461 (S.D.N.Y.), Opinion and Order on Sanctions',
    publisher: 'U.S. District Court for the Southern District of New York',
    date: 'June 22, 2023',
    url: 'https://www.courtlistener.com/docket/63107798/mata-v-avianca-inc/',
  },
  // Chapter 2 quiz
  'noaa-pacific': {
    title: 'How did the Pacific Ocean get its name?',
    publisher: 'NOAA National Ocean Service',
    date: 'accessed Sept. 2026',
    url: 'https://oceanservice.noaa.gov/facts/pacific.html',
  },
  'nasa-jupiter': {
    title: 'Jupiter: Facts',
    publisher: 'NASA Science',
    date: 'accessed Sept. 2026',
    url: 'https://science.nasa.gov/jupiter/jupiter-facts/',
  },
  'geonames-rome': {
    title: 'Rome, Italy (41.89° N)',
    publisher: 'GeoNames',
    date: 'accessed Sept. 2026',
    url: 'https://www.geonames.org/3169070',
  },
  'geonames-nyc': {
    title: 'New York City, United States (40.71° N)',
    publisher: 'GeoNames',
    date: 'accessed Sept. 2026',
    url: 'https://www.geonames.org/5128581',
  },
  'nasa-venus': {
    title: 'Venus: Facts',
    publisher: 'NASA Science',
    date: 'accessed Sept. 2026',
    url: 'https://science.nasa.gov/venus/venus-facts/',
  },
  'physics-today-mercury': {
    by: 'Tom Stockman, Gabriel Monroe & Samuel Cordner',
    title: "Venus is not Earth's closest neighbor",
    publisher: 'Physics Today',
    date: 'Mar. 12, 2019',
    url: 'https://physicstoday.aip.org/opinion/venus-is-not-earths-closest-neighbor',
  },
  'nasa-moon': {
    title: 'Earth’s Moon: Facts',
    publisher: 'NASA Science',
    date: 'accessed Sept. 2026',
    url: 'https://science.nasa.gov/moon/facts/',
  },
  'ocd-cleopatra': {
    title: 'Cleopatra VII, 69–30 BCE',
    publisher: 'Oxford Classical Dictionary',
    date: 'accessed Sept. 2026',
    url: 'https://oxfordre.com/classics/display/10.1093/acrefore/9780199381135.001.0001/acrefore-9780199381135-e-1672',
  },
  'whe-pyramid': {
    title: 'Great Pyramid of Giza (built for Khufu, c. 2560 BCE)',
    publisher: 'World History Encyclopedia',
    date: 'accessed Sept. 2026',
    url: 'https://www.worldhistory.org/Great_Pyramid_of_Giza/',
  },
  'nasa-apollo11': {
    title: 'Apollo 11',
    publisher: 'NASA',
    date: 'July 20, 1969 landing',
    url: 'https://www.nasa.gov/mission/apollo-11/',
  },
  'ethw-fax': {
    title: 'Fax Machines (Alexander Bain’s 1843 patent)',
    publisher: 'Engineering and Technology History Wiki (IEEE)',
    date: 'accessed Sept. 2026',
    url: 'https://ethw.org/Fax_Machines',
  },
  'loc-telephone': {
    title: 'Who is credited with inventing the telephone?',
    publisher: 'Library of Congress',
    date: 'accessed Sept. 2026',
    url: 'https://www.loc.gov/item/who-is-credited-with-inventing-the-telephone/',
  },
  'crowther-2015': {
    by: 'T. W. Crowther et al.',
    title: 'Mapping tree density at a global scale',
    publisher: 'Nature 525',
    date: '2015',
    url: 'https://www.nature.com/articles/nature14967',
  },
  'nasa-milkyway': {
    title: 'How Many Stars in the Milky Way?',
    publisher: 'NASA Blueshift',
    date: 'July 22, 2015',
    url: 'https://asd.gsfc.nasa.gov/blueshift/index.php/2015/07/22/how-many-stars-in-the-milky-way/',
  },
  'oxford-history': {
    title: 'Our history',
    publisher: 'University of Oxford',
    date: 'accessed Sept. 2026',
    url: 'https://www.ox.ac.uk/about/organisation/history',
  },
  'britannica-tenochtitlan': {
    title: 'Tenochtitlan',
    publisher: 'Encyclopaedia Britannica',
    date: 'accessed Sept. 2026',
    url: 'https://www.britannica.com/place/Tenochtitlan',
  },

  // Chapter 3
  dellacqua: {
    by: "Fabrizio Dell'Acqua et al.",
    title:
      'Navigating the Jagged Technological Frontier: Field Experimental Evidence of the Effects of AI on Knowledge Worker Productivity and Quality',
    publisher: 'Harvard Business School Working Paper 24-013',
    date: '2023',
    url: 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4573321',
  },
  'brynjolfsson-2023': {
    by: 'Erik Brynjolfsson, Danielle Li & Lindsey Raymond',
    title: 'Generative AI at Work',
    publisher: 'Quarterly Journal of Economics (2025); arXiv:2304.11771',
    date: '2023–2025',
    url: 'https://arxiv.org/abs/2304.11771',
  },
  'metr-rct': {
    by: 'METR (Joel Becker et al.)',
    title: 'Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity',
    publisher: 'METR; arXiv:2507.09089',
    date: 'July 2025',
    url: 'https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/',
  },
  'noy-zhang-2023': {
    by: 'Shakked Noy & Whitney Zhang',
    title: 'Experimental evidence on the productivity effects of generative artificial intelligence',
    publisher: 'Science 381',
    date: '2023',
    url: 'https://www.science.org/doi/10.1126/science.adh2586',
  },
  'zhang-2024-summaries': {
    by: 'Tianyi Zhang et al.',
    title: 'Benchmarking Large Language Models for News Summarization',
    publisher: 'Transactions of the ACL (2024); arXiv:2301.13848',
    date: '2023–2024',
    url: 'https://arxiv.org/abs/2301.13848',
  },
  wmt24: {
    by: 'Tom Kocmi et al.',
    title: 'Findings of the WMT24 General Machine Translation Shared Task',
    publisher: 'Proceedings of the Ninth Conference on Machine Translation',
    date: '2024',
    url: 'https://aclanthology.org/2024.wmt-1.1/',
  },
  'peng-2023': {
    by: 'Sida Peng et al.',
    title: 'The Impact of AI on Developer Productivity: Evidence from GitHub Copilot',
    publisher: 'arXiv:2302.06590',
    date: '2023',
    url: 'https://arxiv.org/abs/2302.06590',
  },
  'fu-2024': {
    by: 'Tairan Fu et al.',
    title: 'Why Do Large Language Models (LLMs) Struggle to Count Letters?',
    publisher: 'arXiv:2412.18626',
    date: '2024',
    url: 'https://arxiv.org/abs/2412.18626',
  },
  'saxena-2025': {
    by: 'Rohit Saxena, Aryo Pradipta Gema & Pasquale Minervini',
    title: 'Lost in Time: Clock and Calendar Understanding Challenges in Multimodal LLMs',
    publisher: 'arXiv:2502.05092',
    date: '2025',
    url: 'https://arxiv.org/abs/2502.05092',
  },
  'bean-2026': {
    by: 'Andrew M. Bean, Rebecca E. Payne et al.',
    title: 'Reliability of LLMs as medical assistants for the general public: a randomized preregistered study',
    publisher: 'Nature Medicine 32',
    date: '2026',
    url: 'https://www.nature.com/articles/s41591-025-04074-y',
  },
  'ai-index-2026': {
    by: 'Stanford Institute for Human-Centered AI',
    title: 'The 2026 AI Index Report',
    publisher: 'Stanford HAI',
    date: 'Apr. 2026',
    url: 'https://hai.stanford.edu/ai-index/2026-ai-index-report',
  },

  // Chapter 4
  'parasuraman-2010': {
    by: 'Raja Parasuraman & Dietrich H. Manzey',
    title: 'Complacency and Bias in Human Use of Automation: An Attentional Integration',
    publisher: 'Human Factors 52(3)',
    date: '2010',
    url: 'https://doi.org/10.1177/0018720810376055',
  },
  'lee-2025': {
    by: 'Hao-Ping (Hank) Lee et al.',
    title:
      'The Impact of Generative AI on Critical Thinking: Self-Reported Reductions in Cognitive Effort and Confidence Effects From a Survey of Knowledge Workers',
    publisher: 'CHI 2025 (Microsoft Research)',
    date: '2025',
    url: 'https://www.microsoft.com/en-us/research/publication/the-impact-of-generative-ai-on-critical-thinking-self-reported-reductions-in-cognitive-effort-and-confidence-effects-from-a-survey-of-knowledge-workers/',
  },

  // Chapter 5
  'amazon-reuters-2018': {
    by: 'Jeffrey Dastin',
    title: 'Amazon scraps secret AI recruiting tool that showed bias against women',
    publisher: 'Reuters',
    date: 'Oct. 10, 2018',
    url: 'https://www.reuters.com/article/us-amazon-com-jobs-automation-insight-idUSKCN1MK08G',
  },
  'obermeyer-2019': {
    by: 'Ziad Obermeyer, Brian Powers, Christine Vogeli & Sendhil Mullainathan',
    title: 'Dissecting racial bias in an algorithm used to manage the health of populations',
    publisher: 'Science 366',
    date: '2019',
    url: 'https://www.science.org/doi/10.1126/science.aax2342',
  },
  'barocas-selbst-2016': {
    by: 'Solon Barocas & Andrew D. Selbst',
    title: "Big Data's Disparate Impact",
    publisher: 'California Law Review 104',
    date: '2016',
    url: 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2477899',
  },
  'kleinberg-2016': {
    by: 'Jon Kleinberg, Sendhil Mullainathan & Manish Raghavan',
    title: 'Inherent Trade-Offs in the Fair Determination of Risk Scores',
    publisher: 'ITCS 2017; arXiv:1609.05807',
    date: '2016',
    url: 'https://arxiv.org/abs/1609.05807',
  },
  'chouldechova-2017': {
    by: 'Alexandra Chouldechova',
    title: 'Fair prediction with disparate impact: A study of bias in recidivism prediction instruments',
    publisher: 'Big Data 5(2)',
    date: '2017',
    url: 'https://arxiv.org/abs/1703.00056',
  },
  'ugesp-1607': {
    title: '29 CFR § 1607.4(D), Uniform Guidelines on Employee Selection Procedures: the "four-fifths rule"',
    publisher: 'Electronic Code of Federal Regulations',
    date: '1978; text current as of Sept. 1, 2026',
    url: 'https://www.ecfr.gov/current/title-29/subtitle-B/chapter-XIV/part-1607/section-1607.4',
  },
  'samsung-2023': {
    title: 'Samsung Bans Staff’s AI Use After Spotting ChatGPT Data Leak',
    publisher: 'Bloomberg',
    date: 'May 2, 2023',
    url: 'https://www.bloomberg.com/news/articles/2023-05-02/samsung-bans-chatgpt-and-other-generative-ai-use-by-staff-after-leak',
  },
  'moffatt-cbc': {
    by: 'Jason Proctor',
    title: "Air Canada found liable for chatbot's bad advice on plane tickets",
    publisher: 'CBC News',
    date: 'Feb. 15, 2024',
    url: 'https://www.cbc.ca/news/canada/british-columbia/air-canada-chatbot-lawsuit-1.7116416',
  },
  'moffatt-decision': {
    title: 'Moffatt v. Air Canada, 2024 BCCRT 149',
    publisher: 'Civil Resolution Tribunal of British Columbia',
    date: 'Feb. 14, 2024',
    url: 'https://decisions.civilresolutionbc.ca/crt/crtd/en/item/525448/index.do',
  },
  'reg-b': {
    title: '12 CFR § 1002.9(b)(2), Regulation B (Equal Credit Opportunity Act): statement of specific reasons',
    publisher: 'Electronic Code of Federal Regulations',
    date: 'text current as of Sept. 1, 2026',
    url: 'https://www.ecfr.gov/current/title-12/chapter-X/part-1002/section-1002.9',
  },
  'cjeu-2025': {
    title: 'Judgment in Case C-203/22, Dun & Bradstreet Austria (press release No 22/25)',
    publisher: 'Court of Justice of the European Union',
    date: 'Feb. 27, 2025',
    url: 'https://curia.europa.eu/site/upload/docs/application/pdf/2025-02/cp250022en.pdf',
  },
  'nist-rmf': {
    title: 'Artificial Intelligence Risk Management Framework (AI RMF 1.0), NIST AI 100-1',
    publisher: 'U.S. National Institute of Standards and Technology',
    date: 'Jan. 2023',
    url: 'https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-1.pdf',
  },
  'oecd-principles': {
    title: 'OECD AI Principles',
    publisher: 'OECD',
    date: '2019, updated 2024',
    url: 'https://oecd.ai/en/ai-principles',
  },
  'eu-ai-act': {
    title: 'Regulation (EU) 2024/1689 (Artificial Intelligence Act)',
    publisher: 'Official Journal of the European Union',
    date: 'June 13, 2024',
    url: 'https://eur-lex.europa.eu/eli/reg/2024/1689/oj',
  },

  // Close
  'faa-safo-13002': {
    title: 'Safety Alert for Operators 13002: Manual Flight Operations',
    publisher: 'U.S. Federal Aviation Administration',
    date: 'Jan. 4, 2013',
    url: 'https://www.faa.gov/sites/faa.gov/files/other_visit/aviation_industry/airline_operators/airline_safety/SAFO13002.pdf',
  },
  'budzyn-2025': {
    by: 'Krzysztof Budzyń et al.',
    title: 'Endoscopist deskilling risk after exposure to artificial intelligence in colonoscopy: a multicentre, observational study',
    publisher: 'The Lancet Gastroenterology & Hepatology 10(10)',
    date: '2025',
    url: 'https://pubmed.ncbi.nlm.nih.gov/40816301/',
  },
  'bastani-2025': {
    by: 'Hamsa Bastani et al.',
    title: 'Generative AI without guardrails can harm learning: Evidence from high school mathematics',
    publisher: 'PNAS 122(26)',
    date: '2025',
    url: 'https://www.pnas.org/doi/10.1073/pnas.2422633122',
  },
  'bjork-1994': {
    by: 'Robert A. Bjork',
    title: 'Memory and metamemory considerations in the training of human beings',
    publisher: 'In Metacognition: Knowing about Knowing (MIT Press)',
    date: '1994',
  },
};
