/* ============================================================
   Code.gs
   ============================================================ */

/* ============================================================
   Web App
   ============================================================ */
function doGet() {
  return HtmlService.createHtmlOutputFromFile("index");
}

/* ============================================================
   気象庁XML取得
   ・新旧電文コード対応
   ・新XML / 旧XML 両対応
   ・全般気象解説情報
   ・地方気象解説情報
   ・最新10件
   ============================================================ */
function fetchWeather() {

  /* ========================================================
     対象電文コード
     --------------------------------------------------------
     ▼ 新コード
       VPZJ50 : 全般気象情報
       VPCI50 : 地方気象情報

     ▼ 旧コード
       VPCJ50
       VPCJ40
       VPCI40
     ======================================================== */
  const TARGET = [
    // ▼ 新
    'VPZJ50',
    'VPCI50',

    // ▼ 旧
    'VPCJ50',
    'VPCJ40',
    'VPCI40'
  ];

  const list = [];

  const feedUrl =
    "https://www.data.jma.go.jp/developer/xml/feed/extra_l.xml?t=" + Date.now();

  try {

    /* ========================================================
       フィード取得
       ======================================================== */
    const xml =
      UrlFetchApp.fetch(feedUrl).getContentText();

    const doc =
      XmlService.parse(xml);

    const root =
      doc.getRootElement();

    const atomNs =
      XmlService.getNamespace('http://www.w3.org/2005/Atom');

    const entries =
      root.getChildren('entry', atomNs);

    /* ========================================================
       対象抽出
       ======================================================== */
    const filtered = entries.filter(e => {

      const id =
        e.getChildText('id', atomNs) || "";

      return TARGET.some(code =>
        id.includes("_" + code + "_")
      );

    }).slice(0, 10);

    /* ========================================================
       各記事処理
       ======================================================== */
    filtered.forEach(e => {

      const originalTitle =
        e.getChildText('title', atomNs) || "";

      const updated =
        e.getChildText('updated', atomNs) || "";

      let text = "";
      let headline = "";

      /* ====================================================
         タイトル変換
         ==================================================== */
      let title = originalTitle;

      if (
        originalTitle.includes("全般気象情報") ||
        originalTitle.includes("全般気象解説情報")
      ) {
        title = "全般気象解説情報";
      }

      if (
        originalTitle.includes("地方気象情報") ||
        originalTitle.includes("地方気象解説情報")
      ) {
        title = "地方気象解説情報";
      }

      /* ====================================================
         詳細XML URL
         ==================================================== */
      const linkEl =
        e.getChild('link', atomNs);

      const detailUrl =
        linkEl?.getAttribute("href")?.getValue();

      /* ====================================================
         新XML取得
         ==================================================== */
      if (detailUrl) {

        try {

          const detailXml =
            UrlFetchApp.fetch(detailUrl).getContentText();

          const ddoc =
            XmlService.parse(detailXml);

          const droot =
            ddoc.getRootElement();

          const ns =
            droot.getNamespace();

          /* ==================================================
             Body取得
             ================================================== */
          let body =
            droot.getChild("Body", ns);

          // ▼ Report配下対応
          if (!body) {

            const report =
              droot.getChild("Report", ns);

            if (report) {
              body =
                report.getChild("Body", ns);
            }
          }

          /* ==================================================
             新XML解析
             ================================================== */
          if (body) {
            text = parseNewXML(body);
          }

        } catch (err) {

          Logger.log("新XML取得失敗");
          Logger.log(err);

        }
      }

      /* ====================================================
         fallback（旧XML）
         ==================================================== */
      if (!text) {

        const contentEl =
          e.getChild('content', atomNs);

        let content = "";

        if (contentEl) {

          const type =
            contentEl.getAttribute("type")?.getValue() || "";

          if (type === "html") {
            content = contentEl.getValue();
          } else {
            content = contentEl.getText();
          }
        }

        text = content
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<[^>]+>/g, "")
          .replace(/\n+/g, "\n")
          .trim();
      }

      /* ====================================================
         見出し抽出
         ==================================================== */
      const m =
        text.match(/【([^】]+)】/);

      if (m) {
        headline = m[1];
      }

      list.push({
        title: title,
        datetime: updated,
        text: text || "本文取得失敗",
        headline: headline
      });

    });

  } catch (err) {

    Logger.log("フィード取得失敗");
    Logger.log(err);

    return [{
      title: "エラー",
      datetime: "",
      text: err.toString(),
      headline: ""
    }];
  }

  return list;
}

/* ============================================================
   新XML解析
   ・全般気象情報対応
   ・地方気象情報対応
   ・Text総取得
   ============================================================ */
function parseNewXML(root) {

  const result = [];

  const descendants =
    root.getDescendants();

  descendants.forEach(node => {

    try {

      const el =
        node.asElement();

      if (!el) return;

      const name =
        el.getName();

      /* ====================================================
         Text / Name 取得
         ==================================================== */
      if (
        name === "Text" ||
        name === "Name"
      ) {

        const val =
          el.getText().trim();

        if (
          val &&
          val.length > 1 &&
          !result.includes(val)
        ) {
          result.push(val);
        }
      }

    } catch (e) {}

  });

  return result.join("\n");
}
