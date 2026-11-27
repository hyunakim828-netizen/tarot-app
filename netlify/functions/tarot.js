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

    const models = ["gemini-3.8-flash", "gemini-3.8-flash-lite"];
    let lastError = "AI 서버 응답이 지연되고 있습니다.";

    for (const model of models) {
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
