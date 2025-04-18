// ts-remote-consumer.ts - TypeScript file importing HQL that has remote imports
import { formatDateTime, timeFromNow } from './remote-utils.hql';

interface DateFormatter {
  format: (date?: Date, format?: string) => string;
}

class DateHelper implements DateFormatter {
  format(date?: Date, format?: string): string {
    return formatDateTime(date || new Date(), format);
  }
  
  getRelativeTime(date?: Date): string {
    return timeFromNow(date);
  }
}

const helper = new DateHelper();
console.log("TS file importing HQL with remote dependencies");
console.log("Current formatted date:", helper.format());
console.log("Time from now:", helper.getRelativeTime(new Date(Date.now() - 3600000))); // 1 hour ago 