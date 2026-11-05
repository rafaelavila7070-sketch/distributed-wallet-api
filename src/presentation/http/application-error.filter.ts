import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { ApplicationError } from '../../application/errors/application-error.js';

@Catch(ApplicationError)
export class ApplicationErrorFilter implements ExceptionFilter {
  catch(exception: ApplicationError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();
    response.status(exception.statusCode).json({
      statusCode: exception.statusCode,
      error: exception.code,
      message: exception.message,
    });
  }
}
