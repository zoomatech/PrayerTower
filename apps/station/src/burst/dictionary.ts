// Preset dictionary for codec 1 (raw DEFLATE, RFC 1951, primed with this text
// the way zlib's deflateSetDictionary does). Prayer requests reuse a small
// vocabulary, so starting the compressor with these words lets even the first
// prayer in a burst point back at them instead of spelling them out. DEFLATE
// reaches the end of the dictionary most cheaply, so the commonest words come
// last. Changing this text breaks every decoder that has the old one: add a
// new codec number with a new dictionary instead (see docs/RADIO_BURST.md).
export const DICTIONARY_V1 = [
  'anxiety depression addiction recovery cancer chemo chemotherapy radiation diagnosis biopsy scan results MRI tumor stroke heart attack',
  'kidney liver lungs pneumonia infection fever covid flu blood pressure diabetes dementia alzheimers pain chronic disability wheelchair',
  'deployment military soldier deployed overseas travel flight trip driving accident car crash court case lawsuit custody divorce separation',
  'pregnancy pregnant baby born birth delivery miscarriage infertility adoption foster child children kids teenager son daughter grandson granddaughter',
  'husband wife spouse marriage fiance boyfriend girlfriend brother sister mother father mom dad grandma grandpa grandmother grandfather aunt uncle cousin nephew niece',
  'friend neighbor coworker boss pastor church congregation ministry missionary mission team youth group small group Bible study',
  'unemployed laid off job interview new job promotion work business finances money bills rent mortgage debt eviction housing homeless',
  'school college exams test finals graduation scholarship teacher students classes semester',
  'grief loss funeral passed away died memorial loved one lonely loneliness depression fear worry stress overwhelmed tired exhausted',
  'salvation saved faith believe repent forgiveness forgive reconciliation relationship broken restored restoration wisdom guidance direction decision',
  'protection safety safe travels comfort peace strength healing healed health surgery hospital doctor doctors nurses treatment recovery',
  'Lord Jesus Christ God Father Holy Spirit heavenly Father in Jesus name Amen. ',
  'Please pray for my Please pray for our Please pray that Please keep praying Pray for my Pray for our Prayers for my Prayers please for ',
  'I ask for prayer for I am asking for prayers for We ask for prayers for my family my husband my wife my son my daughter my mom my dad my friend ',
  'who is going through who has been who is in the hospital who is having surgery tomorrow this week next week today tonight right now ',
  'that God would that the Lord would that he will that she will that they will be able to and that they would know His peace and comfort ',
  'Thank you for praying. Thank you all for your prayers. Thank you so much. Praise God! God is good. ',
  'for healing and strength, for peace and comfort, for wisdom and guidance, for protection and safety, for a full recovery, ',
  ' the and to for of in my is that with his her their be he she they we our you your this have has will would all as at on it was are ',
].join(' ');
