import { z } from 'zod';

import { LinkStorageDataType, LinkStorageVisibility } from '@prisma/client/edge';

import { prisma } from '~/server/db';
import { publicProcedure } from '~/server/api/trpc.server';
import { v4 as uuidv4 } from 'uuid';


// configuration
const DEFAULT_EXPIRES_SECONDS = 60 * 60 * 24 * 30; // 30 days


/// Zod schemas

const dataTypesSchema = z.enum([LinkStorageDataType.CHAT_V1]);
const dataSchema = z.object({}).passthrough();


const storagePutInputSchema = z.object({
  ownerId: z.string(),
  dataType: dataTypesSchema,
  dataObject: dataSchema,
  studyId: z.string().optional(),
  searchTopic: z.string().optional(),
  expiresSeconds: z.number().optional(),
});

export const storagePutOutputSchema = z.union([
  z.object({
    type: z.literal('success'),
    objectId: z.string(),
    ownerId: z.string(),
    createdAt: z.date(),
    expiresAt: z.date().nullable(),
    deletionKey: z.string(),
  }),
  z.object({
    type: z.literal('error'),
    error: z.string(),
  }),
]);

const storageGetInputSchema = z.object({
  objectId: z.string(),
  ownerId: z.string().optional(),
});

export const storageGetOutputSchema = z.union([
  z.object({
    type: z.literal('success'),
    dataType: dataTypesSchema,
    dataObject: dataSchema,
    studyId: z.string().nullable(),
    searchTopic: z.string().nullable(),
    storedAt: z.date(),
    expiresAt: z.date().nullable(),
  }),
  z.object({
    type: z.literal('error'),
    error: z.string(),
  }),
]);

const storageDeleteInputSchema = z.object({
  objectId: z.string(),
  ownerId: z.string().optional(),
  deletionKey: z.string(),
});

export const storageDeleteOutputSchema = z.object({
  type: z.enum(['success', 'error']),
  error: z.string().optional(),
});


/// tRPC procedures

/**
 * Writes dataObject to DB, returns ownerId, objectId, and deletionKey
 */
export const storagePutProcedure =
  publicProcedure
    .input(storagePutInputSchema)
    .output(storagePutOutputSchema)
    .mutation(async ({ input }) => {

      const { ownerId, dataType, dataObject, studyId, searchTopic, expiresSeconds} = input;

      // Extract studyId from dataObject if it exists there, otherwise use the top-level studyId (for backwards compatibility)
      const studyIdFromData = (dataObject as any)?.studyId;
      const finalStudyId = studyIdFromData || studyId || null;
      
      // Extract searchTopic from dataObject if it exists there, otherwise use the top-level searchTopic (for backwards compatibility)
      const searchTopicFromData = (dataObject as any)?.searchTopic;
      const finalSearchTopic = searchTopicFromData || searchTopic || null;

      const record = await prisma.linkStorage.findUnique({
        where: {
          ownerId: ownerId,
        },
      })

      if(record == null){
        const { id: objectId, ...rest } = await prisma.linkStorage.create({
          select: {
            id: true,
            ownerId: true,
            createdAt: true,
            expiresAt: true,
            deletionKey: true,
          },
          data: {
            ownerId: ownerId || uuidv4(),
            visibility: LinkStorageVisibility.UNLISTED,
            dataType,
            dataSize: JSON.stringify(dataObject).length, // data size estimate
            data: dataObject,
            studyId: finalStudyId, // Extract from dataObject or use provided value
            searchTopic: finalSearchTopic, // Extract from dataObject or use provided value
            expiresAt: expiresSeconds === 0
              ? undefined // never expires
              : new Date(Date.now() + 1000 * (expiresSeconds || DEFAULT_EXPIRES_SECONDS)), // default
            deletionKey: uuidv4(),
            isDeleted: false,
          } as any, // Type assertion needed until Prisma Client types are regenerated
        });

        return {
          type: 'success',
          objectId,
          ...rest,
        };
      }else{
        let { id: objectId, ...rest } = await prisma.linkStorage.update({
          select: {
            id: true,
            ownerId: true,
            createdAt: true,
            expiresAt: true,
            deletionKey: true,
          },
          where: {
            ownerId: ownerId,
          },
          data: {
            data: dataObject,
            studyId: finalStudyId, // Extract from dataObject or use provided value
            searchTopic: finalSearchTopic, // Extract from dataObject or use provided value
          } as any, // Type assertion needed until Prisma Client types are regenerated
        });
        return {
          type: 'success',
          objectId,
          ...rest,
        };
      }

    });


/**
 * Reads an object from DB, if it exists, and is not expired, and is not marked as deleted
 */
export const storageGetProcedure =
  publicProcedure
    .input(storageGetInputSchema)
    .output(storageGetOutputSchema)
    .query(async ({ input: { objectId, ownerId } }) => {

      // read object
      const result = await prisma.linkStorage.findUnique({
        select: {
          dataType: true,
          data: true,
          studyId: true,
          searchTopic: true,
          createdAt: true,
          expiresAt: true,
        } as any, // Type assertion needed until Prisma Client types are regenerated
        where: {
          id: objectId,
          ownerId: ownerId || undefined,
          isDeleted: false,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
      });

      // if not found, return error
      if (!result)
        return {
          type: 'error',
          error: 'Not found',
        };

      if (typeof result.data !== 'object' || result.data === null)
        return {
          type: 'error',
          error: 'Invalid data',
        };

      // increment the read count
      // NOTE: fire-and-forget; we don't care about the result
      {
        prisma.linkStorage.update({
          select: {
            id: true,
          },
          where: {
            id: objectId,
          },
          data: {
            readCount: {
              increment: 1,
            },
          },
        }).catch(() => null);
      }

      // Extract studyId and searchTopic from dataObject if available, otherwise use the top-level values (for backwards compatibility)
      const dataObject = result.data as any;
      const studyIdFromData = dataObject?.studyId;
      const finalStudyId = studyIdFromData || result.studyId;
      const searchTopicFromData = dataObject?.searchTopic;
      const finalSearchTopic = searchTopicFromData || (result as any).searchTopic; // Type assertion needed until Prisma Client types are regenerated

      return {
        type: 'success',
        dataType: result.dataType,
        dataObject: dataObject,
        studyId: finalStudyId,
        searchTopic: finalSearchTopic,
        storedAt: result.createdAt,
        expiresAt: result.expiresAt,
      };

    });


/**
 * Mark a public object as deleted, if it exists, and is not expired, and is not deleted
 */
export const storageMarkAsDeletedProcedure =
  publicProcedure
    .input(storageDeleteInputSchema)
    .output(storageDeleteOutputSchema)
    .mutation(async ({ input: { objectId, ownerId, deletionKey } }) => {

      const result = await prisma.linkStorage.updateMany({
        where: {
          id: objectId,
          ownerId: ownerId || undefined,
          deletionKey,
          isDeleted: false,
        },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
        },
      });

      const success = result.count === 1;

      return {
        type: success ? 'success' : 'error',
        error: success ? undefined : 'Not found',
      };
    });
