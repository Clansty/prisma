import { checkIfEmpty } from '../_referential-integrity-utils/checkIfEmpty'
import { Providers } from '../_utils/providers'
import testMatrix from './_matrix'

/* eslint-disable @typescript-eslint/no-unused-vars */

// @ts-ignore this is just for type checks
declare let prisma: import('@prisma/client').PrismaClient

// @ts-ignore
const describeIf = (condition: boolean) => (condition ? describe : describe.skip)

// m:n relation (SQL database)
async function createXPostsWith2CategoriesSQLDb({ count, postModel }) {
  const prismaPromises: any = []

  for (let i = 0; i < count; i++) {
    // We want to start at 1
    const id = (i + 1).toString()
    const prismaPromise = prisma[postModel].create({
      data: {
        id: id,
        categories: {
          create: [
            {
              category: {
                create: {
                  id: `${id}-cat-a`,
                },
              },
            },
            {
              category: {
                create: {
                  id: `${id}-cat-b`,
                },
              },
            },
          ],
        },
      },
      include: {
        categories: true,
      },
    })
    prismaPromises.push(prismaPromise)
  }

  return await prisma.$transaction(prismaPromises)
}

// If no change
const expectedFindManyPostModelIfNoChange = [
  {
    id: '1',
    published: null,
  },
  {
    id: '2',
    published: null,
  },
]
const expectedFindManyCategoryModelIfNoChange = [
  {
    id: '1-cat-a',
    published: null,
  },
  {
    id: '1-cat-b',
    published: null,
  },
  {
    id: '2-cat-a',
    published: null,
  },
  {
    id: '2-cat-b',
    published: null,
  },
]
const expectedFindManyCategoriesOnPostsModelIfNoChange = [
  {
    categoryId: '1-cat-a',
    postId: '1',
  },
  {
    categoryId: '1-cat-b',
    postId: '1',
  },
  {
    categoryId: '2-cat-a',
    postId: '2',
  },
  {
    categoryId: '2-cat-b',
    postId: '2',
  },
]

testMatrix.setupTestSuite(
  (suiteConfig, suiteMeta) => {
    function conditionalError(errors: Record<Providers, string>): string {
      return errors[suiteConfig.provider] || `TODO add error for ${suiteConfig.provider}`
    }
    const { onDelete } = suiteConfig.referentialActions
    const { onUpdate } = suiteConfig.referentialActions

    /**
     * m:n relationship
     */

    describeIf(suiteConfig.provider !== Providers.MONGODB)('m:n mandatory (explicit) - SQL Databases', () => {
      const postModel = 'PostManyToMany'
      const categoryModel = 'CategoryManyToMany'
      const categoriesOnPostsModel = 'CategoriesOnPostsManyToMany'

      beforeEach(async () => {
        const prismaPromises = [
          prisma[categoriesOnPostsModel].deleteMany(),
          prisma[postModel].deleteMany(),
          prisma[categoryModel].deleteMany(),
        ]
        await prisma.$transaction(prismaPromises)
      })

      describe('[create]', () => {
        test('[create] catgegory alone should succeed', async () => {
          await prisma[categoryModel].create({
            data: {
              id: '1',
            },
          })
          expect(await prisma[categoryModel].findMany()).toEqual([
            {
              id: '1',
              published: null,
            },
          ])
        })

        test('[create] post alone should succeed', async () => {
          await prisma[postModel].create({
            data: {
              id: '1',
            },
          })
          expect(await prisma[postModel].findMany()).toEqual([
            {
              id: '1',
              published: null,
            },
          ])
        })

        // RI=prisma - Cascade/Restrict - SQLServer/CockroachDB/PostgreSQL:  Resolved to value: {"categoryId": "99", "postId": "99"}
        test('[create] categoriesOnPostsModel with non-existing post and category id', async () => {
          if (suiteConfig.referentialIntegrity === 'prisma') {
            expect(
              await prisma[categoriesOnPostsModel].create({
                data: {
                  postId: '99',
                  categoryId: '99',
                },
              }),
            ).resolves
            expect(await prisma[categoriesOnPostsModel].findMany()).toEqual([
              {
                postId: '99',
                categoryId: '99',
              },
            ])
          } else {
            await expect(
              prisma[categoriesOnPostsModel].create({
                data: {
                  postId: '99',
                  categoryId: '99',
                },
              }),
            ).rejects.toThrowError(
              // @ts-expect-error: mongodb is tested in tests_m-to-n-MongoDB.ts
              conditionalError({
                [Providers.POSTGRESQL]:
                  'Foreign key constraint failed on the field: `CategoriesOnPostsManyToMany_postId_fkey (index)`',
                [Providers.COCKROACHDB]: 'Foreign key constraint failed on the field: `(not available)`',
                [Providers.MYSQL]: 'Foreign key constraint failed on the field: `postId`',
                [Providers.SQLSERVER]:
                  'Foreign key constraint failed on the field: `CategoriesOnPostsManyToMany_postId_fkey (index)`',
                [Providers.SQLITE]: 'Foreign key constraint failed on the field: `foreign key`',
              }),
            )

            expect(await prisma[categoriesOnPostsModel].findMany({ orderBy: { categoryId: 'asc' } })).toEqual([])
          }
        })

        test('[create] create post [nested] [create] categories [nested] [create] category should succeed', async () => {
          await prisma[postModel].create({
            data: {
              id: '1',
              categories: {
                create: [
                  {
                    category: {
                      create: {
                        id: '1-cat-a',
                      },
                    },
                  },
                ],
              },
            },
          })
          expect(await prisma[postModel].findMany({ orderBy: { id: 'asc' } })).toEqual([
            {
              id: '1',
              published: null,
            },
          ])
          expect(
            await prisma[categoryModel].findMany({
              orderBy: { id: 'asc' },
            }),
          ).toEqual([
            {
              id: '1-cat-a',
              published: null,
            },
          ])
          expect(await prisma[categoriesOnPostsModel].findMany({ orderBy: { categoryId: 'asc' } })).toEqual([
            {
              categoryId: '1-cat-a',
              postId: '1',
            },
          ])
        })

        // test.skip('[create] x connect with non existing x should throw', async () => {})
      })

      describe('[update]', () => {
        beforeEach(async () => {
          await checkIfEmpty(categoryModel, postModel, categoriesOnPostsModel)
          await createXPostsWith2CategoriesSQLDb({
            count: 2,
            postModel,
          })
        })

        test('[update] (post) optional boolean field should succeed', async () => {
          await prisma[postModel].update({
            where: {
              id: '1',
            },
            data: {
              published: true,
            },
          })

          expect(await prisma[postModel].findMany({ orderBy: { id: 'asc' } })).toEqual([
            {
              id: '1',
              // the update
              published: true,
            },
            {
              id: '2',
              published: null,
            },
          ])
          expect(
            await prisma[categoryModel].findMany({
              orderBy: { id: 'asc' },
            }),
          ).toEqual(expectedFindManyCategoryModelIfNoChange)
          expect(await prisma[categoriesOnPostsModel].findMany({ orderBy: { categoryId: 'asc' } })).toEqual(
            expectedFindManyCategoriesOnPostsModelIfNoChange,
          )
        })

        test('[update] (category): optional boolean field should succeed', async () => {
          await prisma[categoryModel].update({
            where: {
              id: '1-cat-a',
            },
            data: {
              published: true,
            },
          })

          expect(await prisma[postModel].findMany({ orderBy: { id: 'asc' } })).toEqual(
            expectedFindManyPostModelIfNoChange,
          )
          expect(
            await prisma[categoryModel].findMany({
              orderBy: { id: 'asc' },
            }),
          ).toEqual([
            {
              id: '1-cat-a',
              // The update
              published: true,
            },
            {
              id: '1-cat-b',
              published: null,
            },
            {
              id: '2-cat-a',
              published: null,
            },
            {
              id: '2-cat-b',
              published: null,
            },
          ])
          expect(await prisma[categoriesOnPostsModel].findMany({ orderBy: { categoryId: 'asc' } })).toEqual(
            expectedFindManyCategoriesOnPostsModelIfNoChange,
          )
        })

        // RI=prisma - DEFAULT/Cascade/Restrict - PostgreSQL/CockroachDB/SQLServer/SQLite: Resolved to value: {"categoryId": "1-cat-a", "postId": "99"}
        test('[update] categoriesOnPostsModel with non-existing postId should throw', async () => {
          await expect(
            prisma[categoriesOnPostsModel].update({
              where: {
                postId_categoryId: {
                  categoryId: '1-cat-a',
                  postId: '1',
                },
              },
              data: {
                postId: '99',
              },
            }),
          ).rejects.toThrowError(
            // @ts-expect-error: mongodb is tested in tests_m-to-n-MongoDB.ts
            conditionalError({
              [Providers.POSTGRESQL]:
                'Foreign key constraint failed on the field: `CategoriesOnPostsManyToMany_postId_fkey (index)`',
              [Providers.COCKROACHDB]: 'Foreign key constraint failed on the field: `(not available)`',
              [Providers.MYSQL]: 'Foreign key constraint failed on the field: `postId`',
              [Providers.SQLSERVER]:
                'Foreign key constraint failed on the field: `CategoriesOnPostsManyToMany_postId_fkey (index)`',
              [Providers.SQLITE]: 'Foreign key constraint failed on the field: `foreign key`',
            }),
          )

          expect(await prisma[postModel].findMany({ orderBy: { id: 'asc' } })).toEqual(
            expectedFindManyPostModelIfNoChange,
          )
          expect(
            await prisma[categoryModel].findMany({
              orderBy: { id: 'asc' },
            }),
          ).toEqual(expectedFindManyCategoryModelIfNoChange)
          expect(await prisma[categoriesOnPostsModel].findMany({ orderBy: { categoryId: 'asc' } })).toEqual(
            expectedFindManyCategoriesOnPostsModelIfNoChange,
          )
        })

        // RI=prisma - DEFAULT/Cascade/Restrict - PostgreSQL/CockroachDB/SQLServer/SQLite: Resolved to value: {"categoryId": "99", "postId": "1"}
        test('[update] categoriesOnPostsModel with non-existing categoryId should throw', async () => {
          await expect(
            prisma[categoriesOnPostsModel].update({
              where: {
                postId_categoryId: {
                  categoryId: '1-cat-a',
                  postId: '1',
                },
              },
              data: {
                categoryId: '99',
              },
            }),
          ).rejects.toThrowError(
            // @ts-expect-error: mongodb is tested in tests_m-to-n-MongoDB.ts
            conditionalError({
              [Providers.POSTGRESQL]:
                'Foreign key constraint failed on the field: `CategoriesOnPostsManyToMany_categoryId_fkey (index)`',
              [Providers.COCKROACHDB]: 'Foreign key constraint failed on the field: `(not available)`',
              [Providers.MYSQL]: 'Foreign key constraint failed on the field: `categoryId`',
              [Providers.SQLSERVER]:
                'Foreign key constraint failed on the field: `CategoriesOnPostsManyToMany_categoryId_fkey (index)`',
              [Providers.SQLITE]: 'Foreign key constraint failed on the field: `foreign key`',
            }),
          )

          expect(await prisma[postModel].findMany({ orderBy: { id: 'asc' } })).toEqual(
            expectedFindManyPostModelIfNoChange,
          )
          expect(
            await prisma[categoryModel].findMany({
              orderBy: { id: 'asc' },
            }),
          ).toEqual(expectedFindManyCategoryModelIfNoChange)
          expect(await prisma[categoriesOnPostsModel].findMany({ orderBy: { categoryId: 'asc' } })).toEqual(
            expectedFindManyCategoriesOnPostsModelIfNoChange,
          )
        })

        describeIf(['DEFAULT', 'Cascade'].includes(onUpdate))(`onUpdate: DEFAULT, Cascade`, () => {
          test('[update] post id should succeed', async () => {
            await prisma[postModel].update({
              where: {
                id: '1',
              },
              data: {
                id: '3',
              },
            })

            expect(await prisma[postModel].findMany({ orderBy: { id: 'asc' } })).toEqual([
              {
                id: '2',
                published: null,
              },
              {
                // The update
                id: '3',
                published: null,
              },
            ])
            expect(
              await prisma[categoryModel].findMany({
                orderBy: { id: 'asc' },
              }),
            ).toEqual(expectedFindManyCategoryModelIfNoChange)
            expect(await prisma[categoriesOnPostsModel].findMany({ orderBy: { categoryId: 'asc' } })).toEqual([
              {
                categoryId: '1-cat-a',
                // The update
                postId: '3',
              },
              {
                categoryId: '1-cat-b',
                // The update
                postId: '3',
              },
              {
                categoryId: '2-cat-a',
                postId: '2',
              },
              {
                categoryId: '2-cat-b',
                postId: '2',
              },
            ])
          })

          test('[update] category id should succeed', async () => {
            await prisma[categoryModel].update({
              where: {
                id: '1-cat-a',
              },
              data: {
                id: '1-cat-a-updated',
              },
            })

            expect(await prisma[postModel].findMany({ orderBy: { id: 'asc' } })).toEqual(
              expectedFindManyPostModelIfNoChange,
            )
            expect(
              await prisma[categoryModel].findMany({
                orderBy: { id: 'asc' },
              }),
            ).toEqual([
              {
                // The update
                id: '1-cat-a-updated',
                published: null,
              },
              {
                id: '1-cat-b',
                published: null,
              },
              {
                id: '2-cat-a',
                published: null,
              },
              {
                id: '2-cat-b',
                published: null,
              },
            ])
            expect(await prisma[categoriesOnPostsModel].findMany({ orderBy: { categoryId: 'asc' } })).toEqual([
              {
                // The update
                categoryId: '1-cat-a-updated',
                postId: '1',
              },
              {
                categoryId: '1-cat-b',
                postId: '1',
              },
              {
                categoryId: '2-cat-a',
                postId: '2',
              },
              {
                categoryId: '2-cat-b',
                postId: '2',
              },
            ])
          })
        })

        // TODO: these are the same tests as onUpdate: Restrict, different SQL Server message
        describeIf(['NoAction'].includes(onUpdate))(`onUpdate: NoAction`, () => {
          test('[update] post id should throw', async () => {
            await expect(
              prisma[postModel].update({
                where: {
                  id: '1',
                },
                data: {
                  id: '3',
                },
              }),
            ).rejects.toThrowError(
              // @ts-expect-error: mongodb is tested in tests_m-to-n-MongoDB.ts
              conditionalError({
                [Providers.POSTGRESQL]:
                  'Foreign key constraint failed on the field: `CategoriesOnPostsManyToMany_postId_fkey (index)`',
                [Providers.COCKROACHDB]: 'Foreign key constraint failed on the field: `(not available)`',
                [Providers.MYSQL]: 'Foreign key constraint failed on the field: `postId`',
                [Providers.SQLSERVER]:
                  'Foreign key constraint failed on the field: `CategoriesOnPostsManyToMany_postId_fkey (index)`',
                [Providers.SQLITE]: 'Foreign key constraint failed on the field: `foreign key`',
              }),
            )

            expect(await prisma[postModel].findMany({ orderBy: { id: 'asc' } })).toEqual(
              expectedFindManyPostModelIfNoChange,
            )
            expect(
              await prisma[categoryModel].findMany({
                orderBy: { id: 'asc' },
              }),
            ).toEqual(expectedFindManyCategoryModelIfNoChange)
            expect(await prisma[categoriesOnPostsModel].findMany({ orderBy: { categoryId: 'asc' } })).toEqual(
              expectedFindManyCategoriesOnPostsModelIfNoChange,
            )
          })

          test('[update] category id should throw', async () => {
            await expect(
              prisma[categoryModel].update({
                where: {
                  id: '1-cat-a',
                },
                data: {
                  id: '1-cat-a-updated',
                },
              }),
            ).rejects.toThrowError(
              // @ts-expect-error: mongodb is tested in tests_m-to-n-MongoDB.ts
              conditionalError({
                [Providers.POSTGRESQL]:
                  'Foreign key constraint failed on the field: `CategoriesOnPostsManyToMany_categoryId_fkey (index)`',
                [Providers.COCKROACHDB]: 'Foreign key constraint failed on the field: `(not available)`',
                [Providers.MYSQL]: 'Foreign key constraint failed on the field: `categoryId`',
                [Providers.SQLSERVER]:
                  'Foreign key constraint failed on the field: `CategoriesOnPostsManyToMany_categoryId_fkey (index)`',
                [Providers.SQLITE]: 'Foreign key constraint failed on the field: `foreign key`',
              }),
            )

            expect(await prisma[postModel].findMany({ orderBy: { id: 'asc' } })).toEqual(
              expectedFindManyPostModelIfNoChange,
            )
            expect(
              await prisma[categoryModel].findMany({
                orderBy: { id: 'asc' },
              }),
            ).toEqual(expectedFindManyCategoryModelIfNoChange)
            expect(await prisma[categoriesOnPostsModel].findMany({ orderBy: { categoryId: 'asc' } })).toEqual(
              expectedFindManyCategoriesOnPostsModelIfNoChange,
            )
          })
        })

        describeIf(['Restrict'].includes(onUpdate))(`onUpdate: Restrict`, () => {
          test('[update] post id should throw', async () => {
            await expect(
              prisma[postModel].update({
                where: {
                  id: '1',
                },
                data: {
                  id: '3',
                },
              }),
            ).rejects.toThrowError(
              // @ts-expect-error: mongodb is tested in tests_m-to-n-MongoDB.ts
              conditionalError({
                [Providers.POSTGRESQL]:
                  'Foreign key constraint failed on the field: `CategoriesOnPostsManyToMany_postId_fkey (index)`',
                [Providers.COCKROACHDB]: 'Foreign key constraint failed on the field: `(not available)`',
                [Providers.MYSQL]: 'Foreign key constraint failed on the field: `postId`',
                [Providers.SQLSERVER]: 'Foreign key constraint failed on the field: `postId`',
                [Providers.SQLITE]: 'Null constraint violation on the fields: (`postId`)',
              }),
            )

            expect(await prisma[postModel].findMany({ orderBy: { id: 'asc' } })).toEqual(
              expectedFindManyPostModelIfNoChange,
            )
            expect(
              await prisma[categoryModel].findMany({
                orderBy: { id: 'asc' },
              }),
            ).toEqual(expectedFindManyCategoryModelIfNoChange)
            expect(await prisma[categoriesOnPostsModel].findMany({ orderBy: { categoryId: 'asc' } })).toEqual(
              expectedFindManyCategoriesOnPostsModelIfNoChange,
            )
          })

          test('[update] category id should throw', async () => {
            await expect(
              prisma[categoryModel].update({
                where: {
                  id: '1-cat-a',
                },
                data: {
                  id: '1-cat-a-updated',
                },
              }),
            ).rejects.toThrowError(
              // @ts-expect-error: mongodb is tested in tests_m-to-n-MongoDB.ts
              conditionalError({
                [Providers.POSTGRESQL]:
                  'Foreign key constraint failed on the field: `CategoriesOnPostsManyToMany_categoryId_fkey (index)`',
                [Providers.COCKROACHDB]: 'Foreign key constraint failed on the field: `(not available)`',
                [Providers.MYSQL]: 'Foreign key constraint failed on the field: `categoryId`',
                [Providers.SQLSERVER]: 'Foreign key constraint failed on the field: `postId`',
                [Providers.SQLITE]: 'Null constraint violation on the fields: (`categoryId`)',
              }),
            )

            expect(await prisma[postModel].findMany({ orderBy: { id: 'asc' } })).toEqual(
              expectedFindManyPostModelIfNoChange,
            )
            expect(
              await prisma[categoryModel].findMany({
                orderBy: { id: 'asc' },
              }),
            ).toEqual(expectedFindManyCategoryModelIfNoChange)
            expect(await prisma[categoriesOnPostsModel].findMany({ orderBy: { categoryId: 'asc' } })).toEqual(
              expectedFindManyCategoriesOnPostsModelIfNoChange,
            )
          })
        })

        describeIf(['SetNull', 'SetDefault'].includes(onUpdate))(`onUpdate: SetNull, SetDefault`, () => {
          test('[update] post id should throw', async () => {
            await expect(
              prisma[postModel].update({
                where: {
                  id: '1',
                },
                data: {
                  id: '3',
                },
              }),
            ).rejects.toThrowError(
              // @ts-expect-error: mongodb is tested in tests_m-to-n-MongoDB.ts
              conditionalError({
                [Providers.POSTGRESQL]: 'Null constraint violation on the fields: (`postId`)',
                // [Providers.COCKROACHDB]: 'TODO',
                [Providers.MYSQL]: 'Foreign key constraint failed on the field: `postId`',
                // [Providers.SQLSERVER]: 'TODO',
                [Providers.SQLITE]: 'Null constraint violation on the fields: (`postId`)',
              }),
            )

            expect(await prisma[postModel].findMany({ orderBy: { id: 'asc' } })).toEqual(
              expectedFindManyPostModelIfNoChange,
            )
            expect(
              await prisma[categoryModel].findMany({
                orderBy: { id: 'asc' },
              }),
            ).toEqual(expectedFindManyCategoryModelIfNoChange)
            expect(await prisma[categoriesOnPostsModel].findMany({ orderBy: { categoryId: 'asc' } })).toEqual(
              expectedFindManyCategoriesOnPostsModelIfNoChange,
            )
          })

          test('[update] category id should throw', async () => {
            await expect(
              prisma[categoryModel].update({
                where: {
                  id: '1-cat-a',
                },
                data: {
                  id: '1-cat-a-updated',
                },
              }),
            ).rejects.toThrowError(
              // @ts-expect-error: mongodb is tested in tests_m-to-n-MongoDB.ts
              conditionalError({
                [Providers.POSTGRESQL]: 'Null constraint violation on the fields: (`categoryId`)',
                // [Providers.COCKROACHDB]: 'TODO',
                [Providers.MYSQL]: 'Foreign key constraint failed on the field: `categoryId`',
                // [Providers.SQLSERVER]: 'TODO',
                [Providers.SQLITE]: 'Null constraint violation on the fields: (`categoryId`)',
              }),
            )

            expect(await prisma[postModel].findMany({ orderBy: { id: 'asc' } })).toEqual(
              expectedFindManyPostModelIfNoChange,
            )
            expect(
              await prisma[categoryModel].findMany({
                orderBy: { id: 'asc' },
              }),
            ).toEqual(expectedFindManyCategoryModelIfNoChange)
            expect(await prisma[categoriesOnPostsModel].findMany({ orderBy: { categoryId: 'asc' } })).toEqual(
              expectedFindManyCategoriesOnPostsModelIfNoChange,
            )
          })
        })

        test('[update] categoriesOnPostsModel postId should succeed', async () => {
          await prisma[categoriesOnPostsModel].update({
            where: {
              postId_categoryId: {
                categoryId: '1-cat-a',
                postId: '1',
              },
            },
            data: {
              postId: '2',
            },
          })

          expect(await prisma[postModel].findMany({ orderBy: { id: 'asc' } })).toEqual(
            expectedFindManyPostModelIfNoChange,
          )
          expect(
            await prisma[categoryModel].findMany({
              orderBy: { id: 'asc' },
            }),
          ).toEqual(expectedFindManyCategoryModelIfNoChange)
          expect(await prisma[categoriesOnPostsModel].findMany({ orderBy: { categoryId: 'asc' } })).toEqual([
            {
              categoryId: '1-cat-a',
              // the updated postId
              postId: '2',
            },
            {
              categoryId: '1-cat-b',
              postId: '1',
            },
            {
              categoryId: '2-cat-a',
              postId: '2',
            },
            {
              categoryId: '2-cat-b',
              postId: '2',
            },
          ])
        })
      })

      describe('[delete]', () => {
        beforeEach(async () => {
          await checkIfEmpty(categoryModel, postModel, categoriesOnPostsModel)
          await createXPostsWith2CategoriesSQLDb({
            count: 2,
            postModel,
          })
        })

        describeIf(['DEFAULT', 'Restrict', 'NoAction'].includes(onDelete))(
          `onDelete: DEFAULT, Restrict, NoAction`,
          () => {
            // RI=prisma - NoAction - MySQL/SQLServer/CockroachDB/PostgreSQL: Resolved to {"id": "1", "published": null}
            test('[delete] post should throw', async () => {
              await expect(
                prisma[postModel].delete({
                  where: { id: '1' },
                }),
              ).rejects.toThrowError(
                // @ts-expect-error: mongodb is tested in tests_m-to-n-MongoDB.ts
                conditionalError({
                  // Prisma: The change you are trying to make would violate the required relation 'CategoriesOnPostsManyToManyToPostManyToMany' between the `CategoriesOnPostsManyToMany` and `PostManyToMany` models.
                  [Providers.POSTGRESQL]:
                    'Foreign key constraint failed on the field: `CategoriesOnPostsManyToMany_postId_fkey (index)`',
                  [Providers.COCKROACHDB]: 'Foreign key constraint failed on the field: `(not available)`',
                  [Providers.MYSQL]: 'Foreign key constraint failed on the field: `postId`',
                  [Providers.SQLSERVER]:
                    'Foreign key constraint failed on the field: `CategoriesOnPostsManyToMany_postId_fkey (index)`',
                  [Providers.SQLITE]: 'Foreign key constraint failed on the field: `foreign key`',
                }),
              )

              expect(await prisma[postModel].findMany({ orderBy: { id: 'asc' } })).toEqual(
                expectedFindManyPostModelIfNoChange,
              )
              expect(
                await prisma[categoryModel].findMany({
                  orderBy: { id: 'asc' },
                }),
              ).toEqual(expectedFindManyCategoryModelIfNoChange)
              expect(await prisma[categoriesOnPostsModel].findMany({ orderBy: { categoryId: 'asc' } })).toEqual(
                expectedFindManyCategoriesOnPostsModelIfNoChange,
              )
            })

            // RI=prisma - NoAction - MySQL/SQLServer/CockroachDB/PostgreSQL: Resolved to {"id": "1-cat-a", "published": null}
            test('[delete] category should throw', async () => {
              await expect(
                prisma[categoryModel].delete({
                  where: { id: '1-cat-a' },
                }),
              ).rejects.toThrowError(
                // Prisma: The change you are trying to make would violate the required relation 'CategoriesOnPostsManyToManyToCategoryManyToMany' between the `CategoriesOnPostsManyToMany` and `CategoryManyToMany` models.
                // @ts-expect-error: mongodb is tested in tests_m-to-n-MongoDB.ts
                conditionalError({
                  [Providers.POSTGRESQL]:
                    'Foreign key constraint failed on the field: `CategoriesOnPostsManyToMany_categoryId_fkey (index)`',
                  [Providers.COCKROACHDB]: 'Foreign key constraint failed on the field: `(not available)`',
                  [Providers.MYSQL]: 'Foreign key constraint failed on the field: `categoryId`',
                  [Providers.SQLSERVER]:
                    'Foreign key constraint failed on the field: `CategoriesOnPostsManyToMany_categoryId_fkey (index)`',
                  [Providers.SQLITE]: 'Foreign key constraint failed on the field: `foreign key`',
                }),
              )

              expect(await prisma[postModel].findMany({ orderBy: { id: 'asc' } })).toEqual(
                expectedFindManyPostModelIfNoChange,
              )
              expect(
                await prisma[categoryModel].findMany({
                  orderBy: { id: 'asc' },
                }),
              ).toEqual(expectedFindManyCategoryModelIfNoChange)
              expect(await prisma[categoriesOnPostsModel].findMany({ orderBy: { categoryId: 'asc' } })).toEqual(
                expectedFindManyCategoriesOnPostsModelIfNoChange,
              )
            })
          },
        )

        // TODO check why SetDefault works because we don't have @default in the schema
        describeIf(['SetNull', 'SetDefault'].includes(onDelete))(`onDelete: SetNull, SetDefault`, () => {
          test('[delete] post should throw', async () => {
            await expect(
              prisma[postModel].delete({
                where: { id: '1' },
              }),
            ).rejects.toThrowError(
              // @ts-expect-error: mongodb is tested in tests_m-to-n-MongoDB.ts
              conditionalError({
                [Providers.POSTGRESQL]: 'Null constraint violation on the fields: (`postId`)',
                // [Providers.COCKROACHDB]: 'TODO',
                [Providers.MYSQL]: 'Foreign key constraint failed on the field: `postId`',
                // [Providers.SQLSERVER]: 'TODO',
                [Providers.SQLITE]: 'Null constraint violation on the fields: (`postId`)',
              }),
            )

            expect(await prisma[postModel].findMany({ orderBy: { id: 'asc' } })).toEqual(
              expectedFindManyPostModelIfNoChange,
            )
            expect(
              await prisma[categoryModel].findMany({
                orderBy: { id: 'asc' },
              }),
            ).toEqual(expectedFindManyCategoryModelIfNoChange)
            expect(await prisma[categoriesOnPostsModel].findMany({ orderBy: { categoryId: 'asc' } })).toEqual(
              expectedFindManyCategoriesOnPostsModelIfNoChange,
            )
          })
          test('[delete] category should throw', async () => {
            await expect(
              prisma[categoryModel].delete({
                where: { id: '1-cat-a' },
              }),
            ).rejects.toThrowError(
              // @ts-expect-error: mongodb is tested in tests_m-to-n-MongoDB.ts
              conditionalError({
                [Providers.POSTGRESQL]: 'Null constraint violation on the fields: (`categoryId`)',
                // [Providers.COCKROACHDB]: 'TODO',
                [Providers.MYSQL]: 'Foreign key constraint failed on the field: `categoryId`',
                // [Providers.SQLSERVER]: 'TODO',
                [Providers.SQLITE]: 'Null constraint violation on the fields: (`categoryId`)',
              }),
            )

            expect(await prisma[postModel].findMany({ orderBy: { id: 'asc' } })).toEqual(
              expectedFindManyPostModelIfNoChange,
            )
            expect(
              await prisma[categoryModel].findMany({
                orderBy: { id: 'asc' },
              }),
            ).toEqual(expectedFindManyCategoryModelIfNoChange)
            expect(await prisma[categoriesOnPostsModel].findMany({ orderBy: { categoryId: 'asc' } })).toEqual(
              expectedFindManyCategoriesOnPostsModelIfNoChange,
            )
          })
        })

        describeIf(['Cascade'].includes(onDelete))('onDelete: Cascade', () => {
          test('[delete] post should succeed', async () => {
            await prisma[postModel].delete({
              where: { id: '1' },
            })

            expect(await prisma[postModel].findMany({ orderBy: { id: 'asc' } })).toEqual([
              {
                id: '2',
                published: null,
              },
            ])
            expect(
              await prisma[categoryModel].findMany({
                orderBy: { id: 'asc' },
              }),
            ).toEqual(expectedFindManyCategoryModelIfNoChange)
            expect(await prisma[categoriesOnPostsModel].findMany({ orderBy: { categoryId: 'asc' } })).toEqual([
              {
                categoryId: '2-cat-a',
                postId: '2',
              },
              {
                categoryId: '2-cat-b',
                postId: '2',
              },
            ])
          })

          test('[delete] category should succeed', async () => {
            await prisma[categoryModel].delete({
              where: { id: '1-cat-a' },
            })

            expect(await prisma[postModel].findMany({ orderBy: { id: 'asc' } })).toEqual(
              expectedFindManyPostModelIfNoChange,
            )
            expect(
              await prisma[categoryModel].findMany({
                orderBy: { id: 'asc' },
              }),
            ).toEqual([
              {
                id: '1-cat-b',
                published: null,
              },
              {
                id: '2-cat-a',
                published: null,
              },
              {
                id: '2-cat-b',
                published: null,
              },
            ])
            expect(await prisma[categoriesOnPostsModel].findMany({ orderBy: { categoryId: 'asc' } })).toEqual([
              {
                categoryId: '1-cat-b',
                postId: '1',
              },
              {
                categoryId: '2-cat-a',
                postId: '2',
              },
              {
                categoryId: '2-cat-b',
                postId: '2',
              },
            ])
          })
        })

        test('[delete] categoriesOnPosts should succeed', async () => {
          await prisma[categoriesOnPostsModel].delete({
            where: {
              postId_categoryId: {
                categoryId: '1-cat-a',
                postId: '1',
              },
            },
          })

          expect(await prisma[postModel].findMany({ orderBy: { id: 'asc' } })).toEqual(
            expectedFindManyPostModelIfNoChange,
          )
          expect(
            await prisma[categoryModel].findMany({
              orderBy: { id: 'asc' },
            }),
          ).toEqual(expectedFindManyCategoryModelIfNoChange)
          expect(await prisma[categoriesOnPostsModel].findMany({ orderBy: { categoryId: 'asc' } })).toEqual([
            {
              categoryId: '1-cat-b',
              postId: '1',
            },
            {
              categoryId: '2-cat-a',
              postId: '2',
            },
            {
              categoryId: '2-cat-b',
              postId: '2',
            },
          ])
        })
      })
    })
  },
  // Use `optOut` to opt out from testing the default selected providers
  // otherwise the suite will require all providers to be specified.
  {
    optOut: {
      from: ['sqlite', 'mongodb', 'cockroachdb', 'sqlserver', 'mysql', 'postgresql'],
      reason: 'Only testing xyz provider(s) so opting out of xxx',
    },
  },
)
