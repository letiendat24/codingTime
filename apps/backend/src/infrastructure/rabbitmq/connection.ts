import amqp from 'amqplib';
import type { Env } from '../../config';

export function createRabbitMqConnection(env: Env) {
  return amqp.connect(env.RABBITMQ_URL);
}
