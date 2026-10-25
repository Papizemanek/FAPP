# Policy, legal and safety constraints on "looking for"/preference tags + consent-first labelling guidance (18+ casual-dating app, CZ/EU, App Store + Google Play)

Research note, compiled 2026-10-25. Method note: the Apple guidelines page was fetched directly. Google Play support pages, grindr.com, feeld.co and epravo.cz were **not reachable** from the research environment (DNS failure), so Google/Grindr/Feeld facts come from search snippets of those pages and from secondary press coverage. Items marked "[training knowledge]" are well-established facts that I did not re-verify live this session. Treat them as needing a quick check before launch.

---

## 1. Apple App Store: what may appear in-app vs in store metadata; known hookup-app issues

### Takeaway
Casual dating is allowed on the App Store. Apple's 1.1.4 "hookup" language is aimed at apps that facilitate porn, prostitution or trafficking. Store metadata (icon, screenshots, previews, name) must still meet a **4+** standard even when the app is rated 18+, so explicit tag names must never appear in screenshots or store copy. In-app UGC needs filtering, reporting, blocking and published contact info.

### Cited Findings
- 1.1.4 bans "Overtly sexual or pornographic material… This includes 'hookup' apps and other apps that may include pornography or be used to facilitate prostitution, or human trafficking and exploitation." — [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- 1.2 UGC: apps must provide "a method for filtering objectionable material from being posted", a report mechanism with "timely responses", the ability to block abusive users, and published contact info. UGC apps "used primarily for pornographic content… random or anonymous chat, objectification of real people (such as 'hot-or-not' voting)… do not belong on the App Store." NSFW content from a web-based service must be "hidden by default and only displayed when the user turns it on via your website." — [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- 2.3.8: "Metadata should be appropriate for all audiences, so make sure your app and in-app purchase icons, screenshots, and previews adhere to a 4+ age rating even if your app is rated higher." — [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- 2.3.6: answer the age-rating questionnaire honestly; a mis-rating "could trigger an inquiry from government regulators." — [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- 1.4.3: apps that "encourage consumption of… illegal drugs, or excessive amounts of alcohol are not permitted." This is the basis for excluding drug-coded tags. — [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- 4.3(b): dating is a saturated category, and new dating apps are accepted only with "a meaningfully different or improved experience." — [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- Age ratings overhaul (2025): new tiers **13+, 16+, 18+** were added and 12+ and 17+ were removed. Developers had to answer the new questionnaire (in-app controls, capabilities, etc.) by **31 Jan 2026** or updates would be blocked. Ratings can vary by region, and developers can set a higher minimum age. — [iGeeksBlog](https://www.igeeksblog.com/apple-app-store-age-ratings/); [MacTrast](https://www.mactrast.com/2025/07/apple-updates-age-rating-system-in-app-store/amp/); [iClarified](https://www.iclarified.com/97995/apple-overhauls-app-store-age-ratings-with-new-13-16-and-18-categories)
- When the "hookup" wording was added to 1.1.4 in June 2021, Apple said it did not target established casual-dating apps such as Grindr or Scruff. The targets were apps using dating as a front for porn, prostitution or trafficking. — [AppleInsider](https://appleinsider.com/articles/21/06/08/apple-says-grindr-scruff-not-targets-of-recent-guideline-change); [Global Dating Insights](https://www.globaldatinginsights.com/news/apple-explains-guidelines-update-doesnt-prohibit-casual-dating-apps/); [PinkNews](https://thepinknews.com/2021/06/09/apple-app-store-grindr-scruff-new-guideline-appleinsider/)
- ASO guidance after that change advised developers to avoid words like "hookup" in app descriptions, because a reviewer could read them as a 1.1.4 violation. — [Gummicube](https://gummicube.com/blog/app-store-review-guidelines-june-2021-updates)
- Scruff ran into App Store trouble in 2019 and tightened its profile-photo rules in response. — [Out.com](https://www.out.com/news/2021/6/10/apple-clarifies-grindr-scruffs-future-after-app-guideline-update) (reported in context of 2021 coverage)

### Inferences
- In-app tags such as "FWB", "casual", "one-off meet" and "open to kink" are plausibly fine in an 18+-rated app, because Grindr and Feeld operate with similar fields. They must **not** be shown in screenshots, the app name, subtitle, keywords or preview video (2.3.8 requires 4+). Use neutral store copy such as "meet verified adults", "casual dating" or "on your terms".
- Avoid "hookup", "NSA", "one night stand" and "DTF" in store metadata. In-app, prefer softer labels such as "Casual", "Something short-term" and "Spontaneous meet". The literal phrase "no strings attached" is unnecessary risk.
- Tag text that users can write themselves (custom tags or free text) is UGC. Under 1.2 it needs a filter (blocklist) and report/block flows.
- Kink tags shown in-app should stay non-graphic, with no descriptions of sexual acts. Keep explicit detail out of public profile surfaces, ideally behind an opt-in toggle in the spirit of 1.2's "hidden by default" rule.

### Gaps
- I found no public, documented 2024–2026 App Store rejection of a dating app specifically over profile tags. Evidence is anecdotal or older.
- How Apple's 18+ tier interacts with dating questionnaire answers isn't publicly detailed in what I found.

---

## 2. Google Play: Inappropriate Content, sugar-dating ban, metadata

### Takeaway
Google Play bans apps that promote sexually gratifying content or **sex acts for compensation, including "sugar dating"**, and treats sexually suggestive store imagery as a violation. Enforcement on listings is keyword-driven: a polyamory app was suspended over the words "threesome", "kinky dates" and "DTF" in its title and description. Kink, NSA, FWB and ONS wording should stay out of the listing and be softened in-app.

### Cited Findings
- From **1 Sep 2021**, the Inappropriate Content policy prohibits "compensated dating or sexual arrangements where one participant is expected or implied to provide money, gifts or financial support to another participant ('sugar dating')." Apps removed included Sugar Daddy, Elite Millionaire Singles, SeekingArrangement and Spoil. — [Android Police](https://www.androidpolice.com/2021/07/28/google-bans-sugar-daddy-apps-from-play-store/); [Android Central](https://www.androidcentral.com/google-play-policy-sugar-dating-app-spam-restrictions); [UPI](https://www.upi.com/Top_News/US/2021/07/29/Google-to-remove-sugar-daddy-dating-apps-from-Play-Store/6681627577899/); [The Wrap](https://www.thewrap.com/google-play-cuts-off-sugar-daddy-dating-apps)
- The current Sexual Content and Profanity section bans apps that promote sexual content "or anything intended to be sexually gratifying" and apps that "appear to promote or solicit a sexual act in exchange for compensation". "Sex-related entertainment, escort services" appears as a listed violation. — Google Play Console Help (search snippet; page not fetchable this session) [support.google.com/googleplay/android-developer/answer/9878810](https://support.google.com/googleplay/android-developer/answer/9878810)
- Listing imagery: Google's policy names "imagery or videos with sexually suggestive content" and says to avoid suggestive imagery of breasts, buttocks, genitalia, or "other fetishized anatomy or content." — [Android Police (2016 policy update)](https://www.androidpolice.com/2016/10/19/google-updates-play-store-developer-policy-examples-text-images-videos-will-get-app-taken/)
- #open, an ENM/polyamory app, was suspended in 2021 under Sexual Content and Profanity. Google's feedback cited its title and description. After removing "threesome", "kinky dates" and "DTF" it stayed suspended for a while. The developer noted that its near-identical Apple listing was accepted and that competitors used the same words. — [PAPER](https://www.papermag.com/hashtag-open-google-polyamory); [Global Dating Insights](https://www.globaldatinginsights.com/news/non-monogamy-platform-open-fights-google-play-ban/)

### Inferences
- **"Kinky"**: risky in the store listing (it was cited in the #open suspension). In-app it can work as a neutral opt-in field ("Open to kink", "Exploring kink") without describing acts.
- **"NSA" / "One night stand" / "DTF"**: keep out of the listing. In-app, "Casual" or "Short-term" carries the same meaning with less review risk.
- **"FWB"**: reads as a relationship type rather than an act, so it is probably lower-risk in-app. Still avoid it in store keywords.
- **Anything implying money, gifts, "generous", "sponsor", "allowance", "sugar", "spoil me", "arrangement" or "mutually beneficial"** must be excluded entirely. That covers tags, the free-text blocklist and the listing. It is a direct ban on Google Play and an Apple 1.1.4 prostitution risk.
- Google enforcement is inconsistent, so assume the strictest reading on Play.

### Gaps
- I could not fetch the current full text of the Google Play Sexual Content policy or confirm a dedicated "Dating apps" sub-policy. It should be checked live in Play Console, especially for any 2025–2026 changes and the declaration requirements for "dating" apps (e.g. the Target Audience and content rating questionnaire).

---

## 3. Legal and safety exclusions (paid sex, drugs/chemsex, minors/age-play, non-consent, bareback, coded emojis)

### Takeaway
Hard-exclude from tags, and block in free text: (a) any paid or "compensated" framing, (b) drug and "party" coding including emoji, (c) any youth-coded wording, (d) non-consent framing. Sexual-health tags are acceptable, and recommended, when framed positively and optional ("Condoms", "On PrEP", "DoxyPEP", "Recently tested"). Grindr uses this model. Avoid "bareback"/"no condoms" as a selectable tag.

### Cited Findings

**Paid sex / escort / sugar (Czech law + platforms)**
- In Czechia, prostitution itself is not a crime. The system is described as abolitionist: only the accompanying phenomena are punished, such as pimping (kuplířství, § 189 trestního zákoníku), trafficking and coercion. — [Charles University thesis on § 189](https://dspace.cuni.cz/handle/20.500.11956/174795); [Expats.cz](https://www.expats.cz/czech-news/article/czech-court-rules-sex-workers-must-declare-income-tax)
- Commentary on § 189 says "carrying on prostitution" implies repetition, so a one-off paid encounter is not itself pimping. — [Charles University thesis](https://dspace.cuni.cz/handle/20.500.11956/174795)
- Czech legal commentary (epravo.cz) has argued that platforms such as OnlyFans and Stripchat could be viewed as "kupliři" (pimps). The full text was not readable this session. — [epravo.cz](https://www.epravo.cz/top/clanky/onlyfans-stripchat-a-jine-platformy-s-nahotou-jako-kupliri-118953.html)
- § 189 makes it a crime to induce, procure, or solicit another to prostitution, or to profit from another's prostitution [training knowledge, verify against zakonyprolidi.cz].
- Licensing/legalisation bills have been proposed repeatedly, but none was confirmed enacted. — [Radio Prague](https://english.radio.cz/third-time-lucky-legalisation-prostitution-8547166)
- Escort services in CZ operate by advertising "companionship" rather than sex. — [Radio Prague](https://english.radio.cz/third-time-lucky-legalisation-prostitution-8547166)

**Drugs / chemsex / PnP**
- Grindr prohibits promoting drug use in profiles and uses digital and human screening. — [NBC News](https://www.nbcnews.com/feature/nbc-out/sex-drugs-popular-gay-dating-app-allows-users-find-more-n896081)
- Coded terms: "parTy and play"/"PnP" means sex under the influence of drugs, a capital "T" means crystal meth, the diamond emoji means meth and the snowflake emoji means cocaine. — [NBC News](https://www.nbcnews.com/feature/nbc-out/sex-drugs-popular-gay-dating-app-allows-users-find-more-n896081); [PinkNews](https://thepinknews.com/2018/08/02/grindr-drugs-secret-codes-symbols-emojis-tina/)
- Grindr began blocking the cloud emoji (meth) and other drug-linked phrases and symbols in profiles. — [OUTinPerth](https://outinperth.com/grindr-takes-action-online-drug-sales)
- Grindr guidelines: enforcement includes warnings, "proactively block[ing] certain words from profiles", content removal, and bans for severe or repeat violations. — [Grindr Community Guidelines](https://grindr.com/app/guidelines/?lang=en) (search snippet)
- PnP/chemsex involves GHB, ketamine and meth, and investigations in 2025 tied hookup apps to that culture. — [LGBTQ Nation 2025](https://www.lgbtqnation.com/2025/05/how-apps-like-grindr-and-sniffies-are-fueling-the-crisis-among-gay-men/); [Gay Times](https://gaytimes.com/life/grindr-criticised-users-continue-to-buy-sell-drugs)
- Apple 1.4.3 bans encouraging illegal drug consumption (see §1). — [Apple](https://developer.apple.com/app-store/review/guidelines/)

**Minors / age-play / youth-coded terms**
- EU CSA Directive 2011/93/EU covers prosecuting offenders and taking down CSAM. The proposed CSA Regulation would add detection, reporting and removal duties, including grooming detection and age-verification duties for app stores. The interim derogation was extended to 3 Aug 2027. — [Better Internet for Kids (EC)](https://better-internet-for-kids.europa.eu/en/rules-guidelines/csa-directive-child-sexual-abuse-directive-201193eu); [A&L Goodbody TechReg](https://techreg.algoodbody.com/techreg/csam)

**Sexual health**
- Grindr has optional sexual-health tags "I am on DoxyPEP" and "Condoms", with an explicit consent confirmation because they are health data. It notes that condoms are the only method proven against both bacterial and viral STIs. — [Grindr blog](https://grindr.com/blog/taking-control-of-your-sexual-health-introducing-doxypep-condoms-tags-on-grindr)
- Grindr (2016) and Scruff (2015) added optional HIV-status/PrEP fields. Scruff's "safety practices" options let users choose any combination or leave it blank. — [Global Dating Insights](https://www.globaldatinginsights.com/news/grindr-announces-new-hiv-status-fieldsgrindr-announces-new-hiv-status-fields/); [BCCfE](https://bccfe.ca/news/on-scruff-coming-out-about-hiv-prevention-just-got-a-little-bit-easier/)
- Research: 77% of MSM app users were aware of sexual-health features, and 61% of those used them. Researchers frame these fields as tools for "risk sorting". — [AIDS and Behavior (Springer)](https://link.springer.com/article/10.1007/s10461-021-03554-9)
- Disclosing HIV status on apps carries stigma risk. — [After Stonewall / NYCity News Service](https://afterstonewall.nycitynewsservice.com/?p=22)

### Inferences
**Recommended "must NOT include" list (tags + free-text/emoji blocklist):**
1. **Compensation**: sugar, sugar daddy/mommy/baby, generous, sponsor, allowance, PPM, "arrangement", "mutually beneficial", "spoil me", "gifts", escort, "rates", "donations", "roses" (escort code) [training knowledge for coded terms], and currency emoji in sexual context. *Why*: Google Play sugar-dating ban, Apple 1.1.4 prostitution clause, Czech § 189 exposure for the platform.
2. **Drugs/chemsex**: party/PnP/"parTy", "chems", "high fun", "T"/"Tina", "G"/"GHB", "420-friendly" [cannabis is still restricted in CZ, training knowledge], and the cloud, diamond, snowflake, pill and syringe emoji. *Why*: Apple 1.4.3, Grindr practice, harm-reduction risk.
3. **Youth-coded / age-play**: teen, "barely legal", young/"jailbait", schoolgirl/student roleplay, "daddy's girl/little", DDLG/CGL, "petite young", lolita, and the 🍼/🎒 emoji in sexual context. Ban all such content even between verified adults. *Why*: CSAM/grooming detection duties, app-store zero tolerance, detection false negatives. (No public dating-app keyword list was found; this is standard trust-and-safety practice, see Gaps.)
4. **Non-consent framing**: "CNC", "rape play", "no limits", "won't take no", "forced", "drunk/sleepy" scenarios. *Why*: conflicts with consent-first positioning and with Feeld's "active consent" definition, and creates an attack-vector and reputational risk.
5. **Bareback / "no condoms" / "raw" as a selectable tag**. Offer positive, health-oriented options instead ("Condoms always", "On PrEP", "DoxyPEP", "Tested recently", "Let's talk safer sex"). HIV status should be optional, not a public default, and needs an explicit consent prompt (see §5).
6. **Graphic act/body-part tags** (explicit acts, sizes, positions). These fall under Apple 1.1.4 "explicit descriptions" and Google "sexually gratifying". Keep kink at the level of "Open to kink" or "Exploring".
7. **Discriminatory preference phrasing** ("no fats/fems/Asians"). Grindr and Feeld both frame inclusivity as a core rule (see §4).

### Gaps
- I could not read the exact current Grindr guideline text (site unreachable). Snippets only.
- I found no authoritative public list of youth-coded keywords from NCMEC or IWF for dating apps.
- No source covered how Grindr handles "bareback" as a term.
- The exact current wording of Czech § 189 was not verified live.

---

## 4. Consent-first / sex-positive label guidance; ENM vs cheating; safety tags; inclusive language

### Takeaway
Leading sex-positive apps phrase desires as **intent and openness** rather than demands ("Open to exploring…", "Dates", "ENM"). They also anchor everything in an explicit, revocable definition of consent. ENM is presented as honest, communicated non-monogamy (Feeld), which is the opposite of Ashley Madison's affair positioning. Safety-oriented tags give low-pressure ways to set expectations.

### Cited Findings
- Feeld defines active consent as an unambiguous "yes", "freely given, without coercion, without manipulation, not in a state of incapacitation", and says it can be withdrawn at any time. It calls consent non-negotiable, online and offline. — [Feeld community guidelines](https://feeld.co/safety); [Dazed](https://www.dazeddigital.com/life-culture/article/64681/1/is-feeld-too-vanilla-now-kink-dating-apps-relationships)
- Feeld has 30+ "desires" in seven categories, including an "open to exploring dynamics" group (ENM, open relationships, poly) and one-on-one/monogamy options. One of the most common desires is simply "dates", and users are encouraged to "start small". — [Feeld: What are Interests and Desires](https://feeld.co/ask-feeld/how-to/what-are-interests-and-desires-on-feeld)
- Feeld defines ENM as being in relationships with more than one person, and says it works when "communication is clear and respect is mutual." It supports linked partner profiles. — [Feeld FAQ](https://feeld.co/about/faq)
- Feeld bans fake profiles, catfishing and impersonation. Its policy categories include solicitation, sextortion and non-consensual intimate imagery, enforced by warning or removal. — [Feeld safety](https://feeld.co/safety)
- Grindr's guidelines are organized around safety, authenticity and sex positivity. — [Grindr Community Guidelines](https://grindr.com/app/guidelines/?lang=en)
- Commentators worry that an influx of "vanilla tourists" on Feeld puts ENM etiquette and consent at risk. That makes onboarding education on norms worthwhile. — [DatingNews](https://www.datingnews.com/apps-and-sites/feelds-26-revenue-boost-signals-growing-interest-in-non-monogamous-dating/)
- Users say Feeld's separate desires section lets each person decide how upfront to be. — [Fashion Journal](https://fashionjournal.com.au/life/feeld-dating-app/)

### Inferences (recommended framing)
- **Phrase as intent, not demand**: "Open to…", "Exploring…", "Curious about…", "Into…" beats "Want X now". Pair it with an onboarding line such as: "Tags show what you're open to, not a promise. Anyone can change their mind at any time."
- **Relationship-status / discretion tags**: offer "Single", "In an open relationship", "ENM / partner knows", "Poly", and "Couple (linked profiles)". Do **not** offer "Married, looking discreetly", "Affair" or "Cheating". "Discreet" should mean privacy (e.g. "Prefers discretion: photo blur / private photos"), not deception. This follows Feeld's ENM framing and keeps clear of Ashley Madison-style positioning, which carries reputational and fraud/blackmail risk (Ashley Madison's 2015 breach led to extortion of users [training knowledge]).
- **Safety-oriented tags**: "Meet in public first", "Video call before meeting", "Sober meet-ups", "Safer sex always", "Let's talk boundaries first", "Takes it slow", "Consent check-ins". These normalise safety without moralising.
- **Inclusive language**: gender and orientation options beyond the binary, and preferences set as private filters rather than public exclusion text ("no X"). Show what someone is open to, not who they reject.
- **Kink**: one opt-in "Open to kink" or "Exploring kink" tag, shown only to people who have also opted in (mutual-reveal). No act lists on public profiles.

### Gaps
- I couldn't fetch Feeld's full guideline page to quote its exact rules on solicitation and sex work. Press describes Feeld as "pro-sex worker", but no primary source confirmed this, so it is unverified and shouldn't be relied on.
- No sexual-health organisation guidance on profile tag wording was found within the call budget. Czech sources such as the Česká společnost AIDS pomoc or the SZÚ national HIV program could be checked.

---

## 5. GDPR Art. 9: storing sexual preferences (special category data) and minimizing exposure

### Takeaway
"Looking for", kink, orientation and sexual-health tags are **special category data** (sex life, sexual orientation, health). Simply being a user of a sexuality-themed app can reveal Art. 9 data, as the Norwegian Grindr case confirmed. The lawful basis must be **explicit consent** (Art. 9(2)(a)), separate and granular. Sharing with ad SDKs is not allowed under bundled consent. Minimize what is public, stored and shared.

### Cited Findings
- Datatilsynet (Norway) fined Grindr **NOK 65 million (~€5.5m)** in Dec 2021 for sharing user data with ad partners without valid consent. The Privacy Appeals Board upheld it in Sep 2023, the Oslo District Court in 2024, and the **Borgarting Court of Appeal in Oct 2025**. The court found the consent invalid and held that identification as a Grindr user reveals special category data on sexual orientation. Whether there will be a Supreme Court appeal was unclear. — [GRC Report](https://www.grcreport.com/post/norwegian-court-upholds-fine-against-adult-dating-app-over-data-privacy-violations); [Freevacy/NRK](https://www.freevacy.com/news/nrk/grindr-loses-another-appeal-against-its-eur55m-gdpr-fine/6850); [Lexology](https://www.lexology.com/pro/content/another-norwegian-court-sides-against-grindr)
- Grindr itself requires a separate consent confirmation before storing DoxyPEP/condom tags, because they are health information. — [Grindr blog](https://grindr.com/blog/taking-control-of-your-sexual-health-introducing-doxypep-condoms-tags-on-grindr)
- GDPR Art. 9(1) prohibits processing of data on "health or data concerning a natural person's sex life or sexual orientation" unless an Art. 9(2) exception applies. Art. 9(2)(a) is explicit consent for specified purposes, and 9(2)(e) covers data "manifestly made public" by the data subject. — [GDPR text, EUR-Lex](https://eur-lex.europa.eu/eli/reg/2016/679/oj) [training knowledge for exact wording]
- CJEU C-252/21 *Meta v Bundeskartellamt* (2023) held that data revealing sensitive traits, even indirectly, is caught by Art. 9. CJEU C-446/21 *Schrems v Meta* (Oct 2024) held that publicly stating one's sexual orientation does not authorise processing of other data about it for advertising. "Manifestly made public" is therefore narrow. — [CJEU / curia.europa.eu](https://curia.europa.eu/) [training knowledge, verify]
- Art. 25 (data protection by design and by default) and Art. 35 (DPIA for large-scale special-category processing) apply. — [GDPR text, EUR-Lex](https://eur-lex.europa.eu/eli/reg/2016/679/oj) [training knowledge]
- Apple 5.1.1 requires a privacy policy that identifies all data collected and used, confirms that third parties give equal protection, and explains retention/deletion and how to revoke consent. — [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

### Inferences
- Collect tags under **explicit, separate, opt-in consent** (an unticked toggle with plain-language purpose), with a one-tap withdraw that deletes the data.
- **Do not rely on 9(2)(e)** ("made public on a profile") as the lawful basis. *Schrems v Meta* makes that weak.
- **Never send tags, orientation or the fact of app use to ad/analytics SDKs**. That was the core of the Grindr fine. Use first-party, pseudonymised analytics without tag values.
- **Minimize exposure**: keep sensitive tags (kink, HIV/PrEP, ENM) private by default or reveal them only on mutual match or mutual opt-in. Use server-side matching on tags rather than shipping other users' tags to the client in bulk. Offer per-tag visibility (public / matches only / hidden, used for matching only).
- Run a **DPIA** before launch and set short retention of tag history after account deletion.
- Avoid health tags that state HIV status publicly. If offered at all, keep them optional, separately consented, and visible to matches only.

### Gaps
- I did not fetch EDPB guidance or Czech ÚOOÚ positions on dating apps. No Czech-specific enforcement was found.
- The CJEU case details are from training knowledge and were not re-verified live this session.
- The exact current Google Play Data safety requirements for sensitive data were not checked.
