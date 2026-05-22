class ApiError extends Error {
  status;
  code;
  details;
  constructor(args) {
    super(args.message ?? args.code);
    this.name = "ApiError";
    this.status = args.status;
    this.code = args.code;
    this.details = args.details;
  }
}
function isApiError(err) {
  return err instanceof ApiError;
}
function zodToDetails(err) {
  return err.issues.map((i) => ({
    path: i.path.join("."),
    message: i.message,
    code: i.code
  }));
}
export {
  ApiError,
  isApiError,
  zodToDetails
};
