import * as fs from "fs";
import * as p from "@shah/ts-pipe";
import mime from "whatwg-mimetype";
import { Expect, Test, TestFixture, Timeout } from "alsatian";
import { NewsArticle, WebPage } from "schema-dts"
import * as qc from "./queryable-content"

@TestFixture("Uniform Resource Test Suite")
export class TestSuite {
    static test1Url = "https://www.foxnews.com/lifestyle/photo-of-donald-trump-look-alike-in-spain-goes-viral"
    static test1HtmlFile = "queryable-content-spec-1.html.golden";
    static test2Url = "https://www.impactbnd.com/blog/best-seo-news-sites"
    static test2HtmlFile = "queryable-content-spec-2.html.golden";

    static readonly standardContentPipe = p.pipe(
        qc.EnrichQueryableHtmlContent.singleton,
        qc.BuildCuratableContent.singleton,
        qc.StandardizeCurationTitle.singleton);

    async content(testFile: string, pipe: qc.ContentTransformer, contentType: string = "text/html"): Promise<qc.GovernedContent> {
        const htmlSource = fs.readFileSync(testFile)
        const content = await pipe.flow({
            htmlSource: htmlSource.toString(),
            uri: testFile
        }, {
            contentType: contentType,
            mimeType: new mime(contentType)
        });
        return content;
    }

    @Test("Test HTML JSON+LD")
    async testJsonLdSchema(): Promise<void> {
        const content = await this.content(TestSuite.test1HtmlFile, TestSuite.standardContentPipe);
        Expect(content).toBeDefined();
        Expect(qc.isQueryableHtmlContent(content)).toBe(true);
        if (qc.isQueryableHtmlContent(content)) {
            const schemas = content.uptypedSchemas(true);
            Expect(schemas).toBeDefined();
            Expect(schemas?.length).toBe(2);
            if (schemas && schemas[0]) {
                // create a type-safe version of article
                Expect(schemas[0]["@type"]).toBe("NewsArticle");
                const article = schemas[0] as NewsArticle;
                Expect(schemas[1]["@type"]).toBe("WebPage");
                const org = schemas[1] as WebPage;
            }
        }
    }

    @Test("Test OpenGraph via Curatable Content")
    async testCuratableContentOpenGraph(): Promise<void> {
        const content = await this.content(TestSuite.test1HtmlFile, TestSuite.standardContentPipe);
        Expect(content).toBeDefined();
        Expect(qc.isCuratableContent(content)).toBe(true);
        if (qc.isCuratableContent(content)) {
            Expect(content.title).toBe("Photo of Donald Trump 'look-alike' in Spain goes viral");
            Expect(content.socialGraph).toBeDefined();
            if (content.socialGraph) {
                const sg = content.socialGraph;
                Expect(sg.openGraph).toBeDefined();
                Expect(sg.openGraph?.type).toBe("article");
                Expect(sg.openGraph?.title).toBe(content.title);
            }
        }
    }

    @Test("Test a single, valid, UniformResourceContent for Twitter title")
    async testSingleValidResourceTwitter(): Promise<void> {
        const content = await this.content(TestSuite.test2HtmlFile, TestSuite.standardContentPipe);
        Expect(content).toBeDefined();
        Expect(qc.isCuratableContent(content)).toBe(true);
        if (qc.isCuratableContent(content)) {
            Expect(content.socialGraph).toBeDefined();
            if (content.socialGraph) {
                const sg = content.socialGraph;
                Expect(sg.twitter).toBeDefined();
                Expect(sg.twitter?.title).toBe(content.title);
            }
        }
    }

    @Timeout(10000)
    @Test("Test a single, valid, UniformResourceContent for simple HTML page meta data")
    async testSimplePageMetaData(): Promise<void> {
        const content = await this.content(TestSuite.test2HtmlFile, TestSuite.standardContentPipe);
        Expect(content).toBeDefined();
        Expect(qc.isQueryableHtmlContent(content)).toBe(true);
        if (qc.isQueryableHtmlContent(content)) {
            Expect(content.meta()).toBeDefined();
        }
    }
}
