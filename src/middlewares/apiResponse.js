function apiResponse(req, res, next) {
  const sendJson = res.json.bind(res);
  res.json = (body) => {
    if (
      body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      typeof body.success === "boolean" &&
      typeof body.ok !== "boolean"
    ) {
      const response = { ...body, ok: body.success };
      if (!body.success && !response.error) {
        const codes = {
          400: "VALIDATION_ERROR",
          401: "UNAUTHENTICATED",
          403: "FORBIDDEN",
          404: "NOT_FOUND",
          409: "CONFLICT",
          429: "RATE_LIMITED",
        };
        response.error = {
          code: codes[res.statusCode] || "REQUEST_FAILED",
          message:
            typeof body.message === "string"
              ? body.message
              : "The request could not be completed.",
        };
      }
      return sendJson(response);
    }
    return sendJson(body);
  };
  return next();
}

module.exports = apiResponse;
