exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Netlify 환경 변수에 GEMINI_API_KEY가 없습니다." }),
      };
    }

    const bodyData = JSON.parse(event.body || "{}");
    const promptText =
      bodyData.prompt ||
      bodyData.message ||
      bodyData.text ||
      (bodyData.contents && JSON.stringify(bodyData.contents)) ||
      JSON.stringify(bodyData);

    // 1. 현재 API 키로 사용 가능한 모델 목록을 자동으로 가져옴
    const listRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    const listData = await listRes.json();

    let candidateModels = [];
    if (listRes.ok && Array.isArray(listData.models)) {
      candidateModels = listData.models
        .filter(
          (m) =>
            m.supportedGenerationMethods?.includes("generateContent") &&
            m.name.includes("gemini") &&
            !m.name.includes("embedding") &&
            !m.name.includes("vision") &&
            !m.name.includes("image") &&
            !m.name.includes("audio")
        )
        .map((m) => m.name.replace("models/", ""))
        // flash 모델을 우선 정렬하고 최신 버전 순으로 시도
        .sort((a, b) => {
          const aFlash = a.includes("flash") ? 0 : 1;
          const bFlash = b.includes("flash") ? 0 : 1;
          if (aFlash !== bFlash) return aFlash - bFlash;
          return b.localeCompare(a);
        });
    }

    if (candidateModels.length === 0) {
      candidateModels = ["gemini-3.8-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];
    }

    let lastError = "AI 서버 응답이 지연되고 있습니다.";

    // 2. 사용 가능한 모델들을 순서대로 자동 시도 (혼잡 시 다음 모델로 즉시 전환)
    for (const model of candidateModels) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: promptText }] }],
            }),
          }
        );

        const data = await response.json();

        if (response.ok && data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
          const resultText = data.candidates[0].content.parts[0].text;
          return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              result: resultText,
              text: resultText,
              candidates: data.candidates,
            }),
          };
        }

        lastError = data.error?.message || `모델(${model}) 호출 실패`;
      } catch (err) {
        lastError = err.message;
      }
    }

    return {
      statusCode: 503,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: lastError }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
