import { z } from 'zod';
import { showMapInputSchema } from '@/tools/common/schema/show-map.input.schema';

export const reverseGeocodeInputSchema = {
  ...showMapInputSchema,
  posX: z.number().describe('Longitude of the point to look up. For example 127.110750'),
  posY: z.number().describe('Latitude of the point to look up. For example 37.402159'),
};
