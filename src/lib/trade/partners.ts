// UN M49 numeric code → display name for Comtrade partners (shared by the
// /critical-materials and /trade surfaces). Covers every one of the 193 distinct
// partner_code values observed in prod trade_flows on 2026-07-13 plus the
// Comtrade-specific conventions (251 France, 699 India, 490 "Other Asia, nes" =
// Taiwan by Comtrade convention, 842 USA incl. PR). The stored partner_name
// (persisted from Comtrade's partnerDesc when the API supplies it) always wins;
// this map is the deterministic fallback for legacy/missing rows; the last
// resort is an explicit "Partner code N" label — never a bare "#N".

const M49_NAMES: Record<number, string> = {
  4: "Afghanistan", 8: "Albania", 12: "Algeria", 20: "Andorra", 24: "Angola",
  28: "Antigua and Barbuda", 31: "Azerbaijan", 32: "Argentina", 36: "Australia",
  40: "Austria", 44: "Bahamas", 48: "Bahrain", 50: "Bangladesh", 51: "Armenia",
  52: "Barbados", 56: "Belgium", 60: "Bermuda", 68: "Bolivia",
  70: "Bosnia and Herzegovina", 72: "Botswana", 76: "Brazil", 84: "Belize",
  86: "British Indian Ocean Territory", 90: "Solomon Islands",
  92: "British Virgin Islands", 100: "Bulgaria", 104: "Myanmar", 112: "Belarus",
  116: "Cambodia", 120: "Cameroon", 124: "Canada", 136: "Cayman Islands",
  144: "Sri Lanka", 148: "Chad", 152: "Chile", 156: "China", 162: "Christmas Island",
  166: "Cocos (Keeling) Islands", 170: "Colombia", 178: "Congo", 180: "DR Congo",
  184: "Cook Islands", 188: "Costa Rica", 191: "Croatia", 196: "Cyprus",
  203: "Czechia", 204: "Benin", 208: "Denmark", 212: "Dominica",
  214: "Dominican Republic", 218: "Ecuador", 222: "El Salvador",
  226: "Equatorial Guinea", 231: "Ethiopia", 233: "Estonia", 234: "Faroe Islands",
  242: "Fiji", 246: "Finland", 250: "France", 251: "France", 258: "French Polynesia",
  260: "French Southern Territories", 266: "Gabon", 268: "Georgia", 270: "Gambia",
  276: "Germany", 288: "Ghana", 292: "Gibraltar", 300: "Greece", 304: "Greenland",
  320: "Guatemala", 324: "Guinea", 328: "Guyana", 332: "Haiti", 336: "Holy See",
  340: "Honduras", 344: "Hong Kong", 348: "Hungary", 352: "Iceland",
  356: "India", 360: "Indonesia", 368: "Iraq", 372: "Ireland", 376: "Israel",
  380: "Italy", 384: "Côte d'Ivoire", 388: "Jamaica", 392: "Japan",
  398: "Kazakhstan", 400: "Jordan", 404: "Kenya", 410: "South Korea",
  414: "Kuwait", 417: "Kyrgyzstan", 418: "Laos", 422: "Lebanon", 428: "Latvia",
  430: "Liberia", 434: "Libya", 440: "Lithuania", 442: "Luxembourg", 446: "Macao",
  450: "Madagascar", 454: "Malawi", 458: "Malaysia", 462: "Maldives", 466: "Mali",
  470: "Malta", 478: "Mauritania", 480: "Mauritius", 484: "Mexico",
  490: "Taiwan", // Comtrade "Other Asia, nes" — Taiwan by convention
  496: "Mongolia", 498: "Moldova", 499: "Montenegro", 500: "Montserrat",
  504: "Morocco", 508: "Mozambique", 512: "Oman", 516: "Namibia", 520: "Nauru",
  528: "Netherlands", 531: "Curaçao", 533: "Aruba", 534: "Sint Maarten",
  540: "New Caledonia", 554: "New Zealand", 562: "Niger", 566: "Nigeria",
  579: "Norway", 583: "Micronesia", 584: "Marshall Islands", 586: "Pakistan",
  591: "Panama", 598: "Papua New Guinea", 600: "Paraguay", 604: "Peru",
  608: "Philippines", 612: "Pitcairn", 616: "Poland", 620: "Portugal",
  626: "Timor-Leste", 634: "Qatar", 642: "Romania", 643: "Russia", 646: "Rwanda",
  654: "Saint Helena", 659: "Saint Kitts and Nevis", 660: "Anguilla",
  662: "Saint Lucia", 666: "Saint Pierre and Miquelon",
  670: "Saint Vincent and the Grenadines", 674: "San Marino",
  678: "São Tomé and Príncipe", 682: "Saudi Arabia", 686: "Senegal",
  688: "Serbia", 690: "Seychelles", 694: "Sierra Leone",
  699: "India", // Comtrade's India code (M49 356 also mapped above)
  702: "Singapore", 703: "Slovakia", 704: "Vietnam", 705: "Slovenia",
  706: "Somalia", 710: "South Africa", 724: "Spain", 740: "Suriname",
  748: "Eswatini", 752: "Sweden", 757: "Switzerland", 762: "Tajikistan",
  764: "Thailand", 768: "Togo", 776: "Tonga", 780: "Trinidad and Tobago",
  784: "United Arab Emirates", 788: "Tunisia", 792: "Türkiye",
  795: "Turkmenistan", 796: "Turks and Caicos Islands", 798: "Tuvalu",
  800: "Uganda", 804: "Ukraine", 807: "North Macedonia", 818: "Egypt",
  826: "United Kingdom", 834: "Tanzania", 840: "United States",
  842: "United States", // Comtrade "USA incl. Puerto Rico"
  858: "Uruguay", 860: "Uzbekistan", 862: "Venezuela", 876: "Wallis and Futuna",
  882: "Samoa", 887: "Yemen", 894: "Zambia", 899: "Areas, nes",
};

/** Display name for a Comtrade partner: the persisted upstream description wins,
 *  then the deterministic M49 map, then an EXPLICIT unknown label (an analyst
 *  must never see a bare "#699"). */
export function partnerDisplayName(code: number, stored?: string | null): string {
  const s = stored?.trim();
  if (s) return s;
  return M49_NAMES[code] ?? `Partner code ${code}`;
}

/** Exposed for coverage tests. */
export function knownPartnerCodes(): number[] {
  return Object.keys(M49_NAMES).map(Number);
}
