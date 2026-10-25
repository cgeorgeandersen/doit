/**
 * Every real-world claim the cases make, and where it comes from. The cases
 * cite these by id; the shift report lists them. If a claim changes, change
 * it here and in the case text that cites it.
 */
export interface Source {
  title: string;
  publisher: string;
  date: string;
  url: string;
}

export const SOURCES = {
  greenEff: {
    title: 'New Ninth Circuit Opinion Calls Into Question Blind Reliance on License Plate Camera IDs',
    publisher: 'Electronic Frontier Foundation',
    date: 'May 2014',
    url: 'https://www.eff.org/deeplinks/2014/05/new-ninth-circuit-opinion-calls-question-blind-reliance-license-plate-camera-ids',
  },
  greenAclu: {
    title: 'San Francisco Woman Pulled Out of Car at Gunpoint Because of License Plate Reader Error',
    publisher: 'ACLU',
    date: 'May 2014',
    url: 'https://www.aclu.org/news/privacy-technology/san-francisco-woman-pulled-out-car-gunpoint-because',
  },
  mccoy: {
    title: 'Google tracked his bike ride past a burglarized home. That made him a suspect.',
    publisher: 'NBC News',
    date: 'March 2020',
    url: 'https://www.nbcnews.com/news/us-news/google-tracked-his-bike-ride-past-burglarized-home-made-him-n1151761',
  },
  chatrie: {
    title: 'Court rules that law enforcement’s use of “geofence warrant” was a search',
    publisher: 'SCOTUSblog',
    date: 'June 2026',
    url: 'https://www.scotusblog.com/2026/06/court-rules-that-law-enforcements-use-of-geofence-warrant-was-a-search/',
  },
  fog: {
    title: 'Tech tool offers police “mass surveillance on a budget”',
    publisher: 'Associated Press (via WFAE)',
    date: 'September 2022',
    url: 'https://www.wfae.org/crime-justice/2022-09-02/tech-tool-offers-police-mass-surveillance-on-a-budget',
  },
  unique: {
    title: 'Unique in the Crowd: The privacy bounds of human mobility',
    publisher: 'de Montjoye et al., Scientific Reports',
    date: 'March 2013',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3607247/',
  },
  williams: {
    title: '“It didn’t make sense at all”: Wrongful facial recognition arrest in Detroit leads to landmark settlement',
    publisher: 'Michigan Public',
    date: 'June 2024',
    url: 'https://www.michiganpublic.org/criminal-justice-legal-system/2024-06-28/it-didnt-make-sense-at-all-wrongful-facial-recognition-arrest-leads-to-landmark-settlement',
  },
  garbage: {
    title: 'NYPD Used Woody Harrelson Photo to Find Lookalike Beer Thief, Researchers Say',
    publisher: 'NBC New York, on Georgetown Law’s “Garbage In, Garbage Out”',
    date: 'May 2019',
    url: 'https://www.nbcnewyork.com/news/local/police-trick-facial-recognition-celeb-photos/1995841/',
  },
  lineup: {
    title: 'Half of All American Adults are in a Police Face Recognition Database, New Report Finds',
    publisher: 'Georgetown Law',
    date: 'October 2016',
    url: 'https://www.law.georgetown.edu/news/half-of-all-american-adults-are-in-a-police-face-recognition-database-new-report-finds/',
  },
  nist: {
    title: 'Face Recognition Vendor Test, Part 3: Demographic Effects (NISTIR 8280)',
    publisher: 'National Institute of Standards and Technology',
    date: 'December 2019',
    url: 'https://nvlpubs.nist.gov/nistpubs/ir/2019/NIST.IR.8280.pdf',
  },
  baltimore: {
    title: 'Baltimore Police used secret technology to track cellphones in thousands of cases',
    publisher: 'The Baltimore Sun',
    date: 'April 2015',
    url: 'https://www.baltimoresun.com/maryland/baltimore-city/bs-md-ci-stingray-case-20150408-story.html',
  },
  wyden: {
    title: 'Senator Wyden Confirms Cell-Site Simulators Disrupt Emergency Calls',
    publisher: 'Electronic Frontier Foundation',
    date: 'August 2018',
    url: 'https://www.eff.org/deeplinks/2018/08/blog-post-wyden-911-disruption-css',
  },
  wapo: {
    title: 'How rogue officers turned a nationwide camera network into a tool for stalking',
    publisher: 'The Washington Post',
    date: 'August 2026',
    url: 'https://www.washingtonpost.com/technology/2026/08/02/how-police-officers-used-vast-network-cameras-spy-their-exes/',
  },
  kechi: {
    title: 'Former Kechi police lieutenant convicted on stalking charges',
    publisher: 'KWCH',
    date: 'April 2023',
    url: 'https://www.kwch.com/2023/04/05/former-kechi-police-lieutenant-convicted-stalking-charges',
  },
  mittr: {
    title: 'Flock is tightening its rules in response to a growing surveillance backlash',
    publisher: 'MIT Technology Review',
    date: 'August 2026',
    url: 'https://www.technologyreview.com/2026/08/13/1141904/flock-is-tightening-its-rules-in-response-to-a-growing-surveillance-backlash/',
  },
  abortion: {
    title: 'A Texas Cop Searched License Plate Cameras Nationwide for a Woman Who Got an Abortion',
    publisher: '404 Media',
    date: 'May 2025',
    url: 'https://www.404media.co/a-texas-cop-searched-license-plate-cameras-nationwide-for-a-woman-who-got-an-abortion/',
  },
  abortionEff: {
    title: 'Flock Safety and Texas Sheriff Claimed License Plate Search Was for a Missing Person. It Was an Abortion Investigation.',
    publisher: 'Electronic Frontier Foundation',
    date: 'October 2025',
    url: 'https://www.eff.org/deeplinks/2025/10/flock-safety-and-texas-sheriff-claimed-license-plate-search-was-missing-person-it',
  },
  ice: {
    title: 'ICE Taps into Nationwide AI-Enabled Camera Network, Data Shows',
    publisher: '404 Media',
    date: 'May 2025',
    url: 'https://www.404media.co/ice-taps-into-nationwide-ai-enabled-camera-network-data-shows/',
  },
  lum: {
    title: 'Data-driven crime prediction fails to erase human bias (on Lum & Isaac, “To predict and serve?”, Significance, 2016)',
    publisher: 'Science News',
    date: '2016',
    url: 'https://www.sciencenews.org/blog/science-the-public/data-driven-crime-prediction-fails-erase-human-bias',
  },
  ensign: {
    title: 'Runaway Feedback Loops in Predictive Policing',
    publisher: 'Ensign et al., Conference on Fairness, Accountability and Transparency',
    date: '2018',
    url: 'https://proceedings.mlr.press/v81/ensign18a.html',
  },
  markup: {
    title: 'Predictive Policing Software Terrible at Predicting Crimes',
    publisher: 'The Markup and WIRED',
    date: 'October 2023',
    url: 'https://themarkup.org/prediction-bias/2023/10/02/predictive-policing-software-terrible-at-predicting-crimes',
  },
  oig: {
    title: 'ShotSpotter Alerts “Rarely” Lead to Evidence of Gun Crime: City Watchdog',
    publisher: 'WTTW, on the Chicago Office of Inspector General’s report',
    date: 'August 2021',
    url: 'https://news.wttw.com/2021/08/24/shotspotter-alerts-rarely-lead-evidence-gun-crime-city-watchdog',
  },
  apShot: {
    title: 'How AI-powered tech landed man in jail with scant evidence',
    publisher: 'Associated Press (via KVIA)',
    date: 'August 2021',
    url: 'https://kvia.com/ap-national-news/2021/08/18/how-ai-powered-tech-landed-man-in-jail-with-scant-evidence/',
  },
  memphis: {
    title: 'Judge Says Memphis PD’s Surveillance Of Protesters Violated 40-Year-Old Consent Decree',
    publisher: 'Techdirt',
    date: 'November 2018',
    url: 'https://www.techdirt.com/2018/11/01/judge-says-memphis-pds-surveillance-protesters-violated-40-year-old-consent-decree/',
  },
  geofeedia: {
    title: 'Facebook, Instagram, and Twitter Provided Data Access for a Surveillance Product Marketed to Target Activists of Color',
    publisher: 'ACLU of Northern California',
    date: 'October 2016',
    url: 'https://www.aclunc.org/blog/facebook-instagram-and-twitter-provided-data-access-surveillance-product-marketed-target',
  },
  protests: {
    title: 'How Cops Are Using Flock Safety’s ALPR Network to Surveil Protesters and Activists',
    publisher: 'Electronic Frontier Foundation',
    date: 'November 2025',
    url: 'https://www.eff.org/deeplinks/2025/11/how-cops-are-using-flock-safetys-alpr-network-surveil-protesters-and-activists',
  },
  church: {
    title: 'The Church Committee: Intelligence Activities and the Rights of Americans',
    publisher: 'U.S. Senate',
    date: '1976',
    url: 'https://www.senate.gov/about/powers-procedures/investigations/church-committee.htm',
  },
  beware: {
    title: 'Fresno PD drops color-coded threat assessments',
    publisher: 'KVPR',
    date: 'January 2016',
    url: 'https://www.kvpr.org/news/2016-01-26/fresno-pd-drops-color-coded-threat-assessments',
  },
  jones: {
    title: 'United States v. Jones, 565 U.S. 400 (Sotomayor, J., concurring)',
    publisher: 'Legal Information Institute, Cornell Law School',
    date: 'January 2012',
    url: 'https://www.law.cornell.edu/supremecourt/text/10-1259',
  },
  atlas: {
    title: 'Atlas of Surveillance: what technology your local police use',
    publisher: 'Electronic Frontier Foundation',
    date: 'ongoing',
    url: 'https://atlasofsurveillance.org',
  },
  ccops: {
    title: 'Community Control Over Police Surveillance',
    publisher: 'ACLU',
    date: 'ongoing',
    url: 'https://www.aclu.org/community-control-over-police-surveillance',
  },
  trackthepole: {
    title: 'Track the Pole: the Flock cameras on your drive, and who answers for them',
    publisher: 'trackthepole.com',
    date: 'ongoing',
    url: 'https://trackthepole.com',
  },
} satisfies Record<string, Source>;

export type SourceId = keyof typeof SOURCES;
