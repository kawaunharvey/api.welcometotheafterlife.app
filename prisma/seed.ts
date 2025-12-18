import {
  PrismaClient,
  DecoratorStatus,
  DecoratorType,
  Visibility,
  Prisma,
} from "@prisma/client";

const prisma = new PrismaClient();

const salutationCollections: {
  id: string;
  name: string;
  items: string[];
}[] = [
  {
    id: "classic-tributes",
    name: "Classic Tributes",
    items: [
      "In Loving Memory Of",
      "Forever In Our Hearts",
      "Rest In Peace",
      "Cherished Always, Never Forgotten",
      "Gone But Not Forgotten",
    ],
  },
  {
    id: "spiritual-faith",
    name: "Spiritual & Faith",
    items: [
      "Safe In God’s Hands",
      "Until We Meet Again",
      "At Peace in Heaven",
      "In God’s Loving Care",
      "With Angels Above",
    ],
  },
  {
    id: "warm-personal",
    name: "Warm & Personal",
    items: [
      "Beloved Mother, Father, Friend",
      "Your Light Lives On",
      "Love You Always",
      "Always In Our Thoughts",
      "Thank You For Everything",
    ],
  },
  {
    id: "peace-serenity",
    name: "Peace & Serenity",
    items: [
      "At Rest, In Peace",
      "Gentle Rest",
      "Peaceful Journey",
      "Free at Last",
      "Tranquil Slumber",
    ],
  },
  {
    id: "celebration-of-life",
    name: "Celebration of Life",
    items: [
      "Celebrating a Beautiful Life",
      "A Life Well Lived",
      "Honoring Your Legacy",
      "Your Story Inspires Us",
      "With Gratitude For Your Life",
    ],
  },
  {
    id: "hope-remembrance",
    name: "Hope & Remembrance",
    items: [
      "Memories That Warm Our Hearts",
      "Your Love Remains",
      "Remembered With Joy",
      "Holding You in Light",
      "Never Far From Our Hearts",
    ],
  },
];

async function main() {
  const collectionBySlug: Record<string, { id: string }> = {};

  for (const collection of salutationCollections) {
    const created = await prisma.decoratorCollection.upsert({
      where: { slug: collection.id },
      update: { label: collection.name },
      create: {
        slug: collection.id,
        label: collection.name,
        description: null,
      },
    });
    collectionBySlug[collection.id] = { id: created.id };
  }

  for (const collection of salutationCollections) {
    for (const phrase of collection.items) {
      const existing = await prisma.decorator.findFirst({
        where: { type: DecoratorType.SALUTATION, label: phrase },
      });

      const data = {
        type: DecoratorType.SALUTATION,
        label: phrase,
        description: null as string | null,
        categories: [collection.name],
        tags: ["salutation", collection.id],
        status: DecoratorStatus.ACTIVE,
        visibility: Visibility.PUBLIC,
        textValue: phrase,
        assetUrl: null as string | null,
        assetType: null as string | null,
        assetId: null as string | null,
        thumbnailUrl: null as string | null,
        metadata: null as Prisma.InputJsonValue | null,
        collectionId: collectionBySlug[collection.id]?.id,
      };

      if (existing) {
        await prisma.decorator.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await prisma.decorator.create({ data });
      }
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    // eslint-disable-next-line no-console
    console.log("Seeded salutation decorators");
  })
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
