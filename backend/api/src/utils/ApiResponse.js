class ApiResponse {
    constructor(statusCode, data, message="Success") {
        this.statusCode = statusCode;
        this.message = message;
        this.data = data;
        this.sucess= statusCode < 400
    }
}

export default ApiResponse