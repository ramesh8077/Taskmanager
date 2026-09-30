function validateRequest(schema, target = "body") {
  return (req, res, next) => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join(".") || target}: ${issue.message}`)
        .join("; ");
      return res.status(400).json({
        ok: false,
        error: { code: "VALIDATION_ERROR", message },
        success: false,
        message,
      });
    }
    if (target === "query") {
      req.validatedQuery = result.data;
    } else if (target === "params") {
      req.validatedParams = result.data;
    } else {
      req.body = result.data;
    }
    return next();
  };
}

module.exports = { validateRequest };
