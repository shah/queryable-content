import * as p from "@shah/ts-pipe";
import cheerio from "cheerio";
import mime from "whatwg-mimetype";

export type ContentBody = string;
export type ContentTitle = string;
export type ContentAbstract = string;

// NOTE: for all GovernedContent and related interfaces be careful using functions
// (unless the functions are properties) because the spread operator is used for copying
// of contents often (especially in content transfomers).

export interface GovernedContent {
  readonly contentType: string;
  readonly mimeType: mime;
}

export function isGovernedContent(o: any): o is GovernedContent {
  return o && ("contentType" in o) && ("mimeType" in o);
}

export interface GovernedContentContext {
  readonly uri: string;
  readonly htmlSource: string;
}

export interface HtmlAnchor {
  readonly href: string;
  readonly label?: string;
}

export interface AnchorFilter {
  (retain: HtmlAnchor): boolean;
}

export interface HtmlImage {
  readonly src?: string;
  readonly alt?: string;
  readonly width?: number | string;
  readonly height?: number | string;
  readonly imageElem: CheerioElement;
}

export interface ImageFilter {
  (retain: HtmlImage): boolean;
}

export interface PageIcon {
  readonly name: string;
  readonly type: string;
  readonly href: string;
  readonly sizes: string;
}

export class HtmlMeta {
  [key: string]: any;
}

export interface HtmlMetaConsumer extends p.PipeUnion<HtmlMetaConsumerContext, HtmlMeta> {
}

export type UntypedObject = any;

export interface UntypedObjectFilter {
  (retain: UntypedObject): boolean;
}

export interface SchemaParseErrorHandler {
  (ctx: GovernedContentContext, index: number, elem: CheerioElement, err: Error): void;
}

export interface CuratableContent extends GovernedContent {
  readonly title: ContentTitle;
  readonly socialGraph: SocialGraph;
}

export function isCuratableContent(o: any): o is CuratableContent {
  return o && "title" in o && "socialGraph" in o;
}

export interface QueryableHtmlContent extends GovernedContent {
  readonly htmlSource: string;
  readonly document: CheerioStatic;
  readonly anchors: (retain?: AnchorFilter) => HtmlAnchor[];
  readonly images: (retain?: ImageFilter) => HtmlImage[];
  readonly untypedSchemas: (unwrapGraph: boolean, retain?: UntypedObjectFilter, eh?: SchemaParseErrorHandler) => UntypedObject[] | undefined;
  readonly pageIcons: () => PageIcon[];
  readonly meta: (consumer?: HtmlMetaConsumer) => HtmlMeta;
}

export function isQueryableHtmlContent(o: any): o is QueryableHtmlContent {
  return o && "htmlSource" in o && "document" in o;
}

export interface OpenGraph {
  type?: string;
  title?: ContentTitle;
  description?: ContentAbstract;
  imageURL?: string;
  keywords?: string[];
}

export interface TwitterCard {
  title?: ContentTitle;
  description?: ContentAbstract;
  imageURL?: string;
  site?: string;
  creator?: string;
}

export interface SocialGraph {
  readonly openGraph?: Readonly<OpenGraph>;
  readonly twitter?: Readonly<TwitterCard>;
}

export interface TransformedContent extends GovernedContent {
  readonly transformedFromContent: GovernedContent;
  readonly pipePosition: number;
  readonly remarks?: string;
}

export function isTransformedContent(o: any): o is TransformedContent {
  return o && "transformedFromContent" in o;
}

/************************
 * Content transformers *
 ************************/

export function nextTransformationPipePosition(o: any): number {
  return "pipePosition" in o ? o.pipePosition + 1 : 0;
}

export interface ContentTransformer extends p.PipeUnion<GovernedContentContext, GovernedContent> {
}

const pageIconSelectors = [
  ["defaultIcon", "link[rel='icon']"],
  ["shortcutIcon", "link[rel='shortcut icon']"],
  ["appleTouchIcon", "link[rel='apple-touch-icon']"],
  ["appleTouchIconPrecomposed", "link[rel='apple-touch-icon-precomposed']"],
  ["appleTouchStartupImage", "link[rel='apple-touch-startup-image']"],
  ["maskIcon", "link[rel='mask-icon']"],
  ["fluidIcon", "link[rel='fluid-icon']"],
];

export interface HtmlMetaConsumerContext {
  readonly document: CheerioStatic;
}

export class ConsumeHtmlMeta implements HtmlMetaConsumer {
  static readonly nameAndPropertyOnly = new ConsumeHtmlMeta();

  async flow(ctx: HtmlMetaConsumerContext, meta: HtmlMeta): Promise<HtmlMeta> {
    ctx.document("meta").each((_, metaElem): void => {
      const name = metaElem.attribs["name"];
      const property = metaElem.attribs["property"];
      if (name || property) {
        meta[name || property] = metaElem.attribs["content"];
      }
    });
    return meta;
  }
}

export class EnrichQueryableHtmlContent implements ContentTransformer {
  static readonly singleton = new EnrichQueryableHtmlContent();

  typedAttribute(elem: CheerioElement, name: string): string | number {
    const value = elem.attribs[name];
    const int = parseInt(value);
    const float = parseFloat(value);
    return isNaN(float) ? (isNaN(int) ? value : int) : float;
  }

  anchors(document: CheerioStatic, retain?: AnchorFilter): HtmlAnchor[] {
    const result: HtmlAnchor[] = []
    document("a").each((_, anchorTag): void => {
      const href = anchorTag.attribs["href"];
      if (href) {
        const anchor: HtmlAnchor = {
          href: href,
          label: document(anchorTag).text()
        }
        if (retain) {
          if (retain(anchor)) result.push(anchor);
        } else {
          result.push(anchor);
        }
      }
    });
    return result;
  }

  images(document: CheerioStatic, retain?: ImageFilter): HtmlImage[] {
    const result: HtmlImage[] = []
    document("img").each((_, imgElem): void => {
      const image: HtmlImage = {
        src: imgElem.attribs["src"],
        alt: imgElem.attribs["alt"],
        width: this.typedAttribute(imgElem, "width"),
        height: this.typedAttribute(imgElem, "height"),
        imageElem: imgElem
      }
      if (retain) {
        if (retain(image)) result.push(image);
      } else {
        result.push(image);
      }
    });
    return result;
  }

  untypedSchemas(ctx: GovernedContentContext, document: CheerioStatic, unwrapGraph: boolean, retain?: UntypedObjectFilter, eh?: SchemaParseErrorHandler): UntypedObject[] | undefined {
    const result: UntypedObject[] = [];
    document('script[type="application/ld+json"]').each((index, scriptElem): void => {
      const script = scriptElem.children[0].data;
      if (script) {
        try {
          const ldJSON: UntypedObject = JSON.parse(script);
          if (ldJSON["@graph"]) {
            if (unwrapGraph) {
              for (const node of ldJSON["@graph"]) {
                if (retain) {
                  if (retain(node)) result.push(node);
                } else {
                  result.push(node);
                }
              }
              return;
            }
          }
          if (retain) {
            if (retain(ldJSON)) result.push(ldJSON);
          } else {
            result.push(ldJSON);
          }
        } catch (err) {
          if (eh) eh(ctx, index, scriptElem, err);
        }
      }
    });
    return result;
  }

  pageIcons(document: CheerioStatic): PageIcon[] {
    const result: PageIcon[] = [];
    pageIconSelectors.forEach((selector) => {
      document(selector[1]).each((_, linkElem) => {
        const { href, sizes, type } = linkElem.attribs;
        if (href && href !== '#') {
          const icon = {
            name: selector[0],
            sizes,
            href,
            type,
          };
          result.push(icon);
        }
      });
    });
    return result;
  }

  meta(document: CheerioStatic, consumer: HtmlMetaConsumer = ConsumeHtmlMeta.nameAndPropertyOnly): HtmlMeta {
    return consumer.flow({ document: document }, {});
  }

  async flow(ctx: GovernedContentContext, content: GovernedContent): Promise<GovernedContent | QueryableHtmlContent> {
    if (isQueryableHtmlContent(content)) {
      // it's already queryable so don't touch it
      return content;
    }

    // enrich the existing content with cheerio static document
    const document = cheerio.load(ctx.htmlSource, {
      normalizeWhitespace: true,
      decodeEntities: true,
      lowerCaseTags: true,
      lowerCaseAttributeNames: true,
    })
    const self = this;
    return {
      ...content,
      htmlSource: ctx.htmlSource,
      document: document,
      anchors: (retain?: AnchorFilter): HtmlAnchor[] => {
        return self.anchors(document, retain);
      },
      images: (retain?: ImageFilter): HtmlImage[] => {
        return self.images(document, retain);
      },
      untypedSchemas: (unwrapGraph: boolean, retain?: UntypedObjectFilter, eh?: SchemaParseErrorHandler): UntypedObject[] | undefined => {
        return self.untypedSchemas(ctx, document, unwrapGraph, retain, eh);
      },
      pageIcons: (): PageIcon[] => {
        return self.pageIcons(document);
      },
      meta: (consumer?: HtmlMetaConsumer): HtmlMeta => {
        return this.meta(document, consumer);
      }
    };
  }
}

export class BuildCuratableContent implements ContentTransformer {
  static readonly singleton = new BuildCuratableContent();

  parseOpenGraph(_: GovernedContentContext, document: CheerioStatic): OpenGraph {
    let result: OpenGraph = {};
    const metaTransformers: {
      [key: string]: (v: string) => void;
    } = {
      'og:type': (v: string) => { result.type = v },
      'og:title': (v: string) => { result.title = v },
      'og:description': (v: string) => { result.description = v },
      'og:image': (v: string) => { result.imageURL = v },
      'og:keywords': (v: string) => { result.keywords = v.split(",").map(kw => kw.trim()) },
    };
    const meta = document('meta') as any;
    const keys = Object.keys(meta);
    for (const outerKey in metaTransformers) {
      keys.forEach(function (innerKey) {
        if (meta[innerKey].attribs
          && meta[innerKey].attribs.property
          && meta[innerKey].attribs.property === outerKey) {
          metaTransformers[outerKey](meta[innerKey].attribs.content);
        }
      })
    }
    return result;
  }

  parseTwitterCard(_: GovernedContentContext, document: CheerioStatic): TwitterCard {
    let result: TwitterCard = {};
    const metaTransformers: {
      [key: string]: (v: string) => void;
    } = {
      'twitter:title': (v: string) => { result.title = v },
      'twitter:image': (v: string) => { result.imageURL = v },
      'twitter:description': (v: string) => { result.description = v },
      'twitter:site': (v: string) => { result.site = v },
      'twitter:creator': (v: string) => { result.creator = v },
    };
    const meta = document('meta') as any;
    const keys = Object.keys(meta);
    for (const outerKey in metaTransformers) {
      keys.forEach(function (innerKey) {
        if (meta[innerKey].attribs
          && meta[innerKey].attribs.name
          && meta[innerKey].attribs.name === outerKey) {
          metaTransformers[outerKey](meta[innerKey].attribs.content);
        }
      })
    }
    return result;
  }

  parseSocialGraph(ctx: GovernedContentContext, document: CheerioStatic): SocialGraph {
    const og = this.parseOpenGraph(ctx, document);
    const tc = this.parseTwitterCard(ctx, document);
    const result: { [key: string]: any } = {};
    if (Object.keys(og).length > 0) result.openGraph = og;
    if (Object.keys(tc).length > 0) result.twitter = tc;
    return result as SocialGraph;
  }

  title(ctx: GovernedContentContext, document: CheerioStatic, sg?: SocialGraph): string {
    // If an og:title is available, use it otherwise use twitter:title otherwise use page title
    const socialGraph = sg ? sg : this.parseSocialGraph(ctx, document);
    let result = document('head > title').text();
    if (socialGraph.twitter?.title)
      result = socialGraph.twitter.title;
    if (socialGraph.openGraph?.title)
      result = socialGraph.openGraph.title;
    return result;
  }

  async flow(ctx: GovernedContentContext, content: GovernedContent): Promise<GovernedContent | CuratableContent> {
    let result: GovernedContent | QueryableHtmlContent = content;
    if (!isQueryableHtmlContent(result)) {
      // first make it queryable
      result = await EnrichQueryableHtmlContent.singleton.flow(ctx, result);
    }

    if (isQueryableHtmlContent(result)) {
      const socialGraph = this.parseSocialGraph(ctx, result.document)
      return {
        ...result,
        title: this.title(ctx, result.document, socialGraph),
        socialGraph: socialGraph
      };
    } else {
      console.error("[EnrichCuratableContent.transform()] This should never happen!")
      return content;
    }
  }
}

export class StandardizeCurationTitle implements ContentTransformer {
  // RegEx matches " | Healthcare IT News" from a title like "xyz title | Healthcare IT News"
  static readonly sourceNameAfterPipeRegEx = / \| .*$/;
  static readonly singleton = new StandardizeCurationTitle();

  async flow(_: GovernedContentContext, content: GovernedContent): Promise<GovernedContent | CuratableContent | TransformedContent> {
    if (isCuratableContent(content)) {
      const suggested = content.title;
      const standardized = suggested.replace(StandardizeCurationTitle.sourceNameAfterPipeRegEx, "");
      if (suggested != standardized) {
        return {
          ...content,
          title: standardized,
          transformedFromContent: content,
          pipePosition: nextTransformationPipePosition(content),
          remarks: `Standardized title (was "${suggested}")`
        }
      }
    }
    return content;
  }
}

