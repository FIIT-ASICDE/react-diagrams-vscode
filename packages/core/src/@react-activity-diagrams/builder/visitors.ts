import {
  Statement,
  Node as MorphNode,
  SyntaxKind,
  IfStatement,
  WhileStatement,
  ForStatement,
  ExpressionStatement,
  VariableStatement,
  Block,
} from 'ts-morph';
import { GraphWriter } from './graph-writer';

export type BuildResult = {
  entry?: string;
  exits: string[];
};

export class StatementVisitor {
  constructor(private writer: GraphWriter) {}

  private getExpandableMeta(stmt: Statement): { label: string; nodeKind: 'function' | 'class' | 'interface' | 'type' } | undefined {
    if (stmt.getKind() === SyntaxKind.FunctionDeclaration) {
      const name = stmt.asKind(SyntaxKind.FunctionDeclaration)?.getName() ?? 'anonymous';
      return { label: `function ${name}()`, nodeKind: 'function' };
    }

    if (stmt.getKind() === SyntaxKind.ClassDeclaration) {
      const name = stmt.asKind(SyntaxKind.ClassDeclaration)?.getName() ?? 'anonymous';
      return { label: `class ${name}`, nodeKind: 'class' };
    }

    if (stmt.getKind() === SyntaxKind.InterfaceDeclaration) {
      const name = stmt.asKind(SyntaxKind.InterfaceDeclaration)?.getName() ?? 'anonymous';
      return { label: `interface ${name}`, nodeKind: 'interface' };
    }

    if (stmt.getKind() === SyntaxKind.TypeAliasDeclaration) {
      const name = stmt.asKind(SyntaxKind.TypeAliasDeclaration)?.getName() ?? 'anonymous';
      return { label: `type ${name}`, nodeKind: 'type' };
    }

    if (stmt.getKind() === SyntaxKind.VariableStatement) {
      const variableStmt = stmt as VariableStatement;
      const declaration = variableStmt.getDeclarations()[0];
      const initializer = declaration?.getInitializer();

      if (!initializer) {
        return undefined;
      }

      const hasFunctionInitializer =
        initializer.getDescendantsOfKind(SyntaxKind.ArrowFunction).length > 0 ||
        initializer.getDescendantsOfKind(SyntaxKind.FunctionExpression).length > 0;
      const hasClassInitializer = initializer.getDescendantsOfKind(SyntaxKind.ClassExpression).length > 0;

      if (hasFunctionInitializer) {
        const name = declaration?.getName() ?? 'anonymous';
        return { label: `function ${name}()`, nodeKind: 'function' };
      }

      if (hasClassInitializer) {
        const name = declaration?.getName() ?? 'anonymous';
        return { label: `class ${name}`, nodeKind: 'class' };
      }
    }

    return undefined;
  }

  private compact(text: string): string {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    return cleaned.length > 40 ? `${cleaned.slice(0, 37)}...` : cleaned;
  }

  visitStatements(statements: Statement[]): BuildResult {
    let entry: string | undefined;
    let pendingExits: string[] = [];

    for (let i = 0; i < statements.length; i++) {
      if (statements[i].getKind() === SyntaxKind.ImportDeclaration) {
        continue;
      }

      const result = this.visitStatement(statements[i]);

      if (!result.entry) continue;

      if (!entry) {
        entry = result.entry;
      }

      for (const exit of pendingExits) {
        this.writer.addEdge(exit, result.entry);
      }

      pendingExits = result.exits;
    }

    return {
      entry,
      exits: entry ? pendingExits.length ? pendingExits : [] : [],
    };
  }

  visitStatement(stmt: Statement): BuildResult {
    const expandableMeta = this.getExpandableMeta(stmt);
    if (expandableMeta) {
      const id = this.writer.addFlowNode('expandable', this.compact(expandableMeta.label), {
        sourceText: stmt.getText(),
        nodeKind: expandableMeta.nodeKind,
      });
      return { entry: id, exits: [id] };
    }

    if (stmt.getKind() === SyntaxKind.ExpressionStatement) {
      return this.visitAction((stmt as ExpressionStatement).getExpression().getText(), stmt.getText());
    }
    if (stmt.getKind() === SyntaxKind.ReturnStatement) {
      const id = this.writer.addFlowNode('action', this.compact(stmt.getText()) + " return", {
        sourceText: stmt.getText(),
        nodeKind: 'return',
      });
      return { entry: id, exits: [] };
    }

    if (stmt.getKind() === SyntaxKind.IfStatement) {
      return this.visitIf(stmt as IfStatement);
    }

    if (stmt.getKind() === SyntaxKind.WhileStatement) {
      return this.visitWhile(stmt as WhileStatement);
    }

    if (stmt.getKind() === SyntaxKind.ForStatement) {
      return this.visitFor(stmt as ForStatement);
    }

    if (stmt.getKind() === SyntaxKind.Block) {
      return this.visitStatements((stmt as Block).getStatements());
    }

    return this.visitAction(this.compact(stmt.getText()), stmt.getText());
  }

  visitAction(label: string, sourceText?: string): BuildResult {
    const id = this.writer.addFlowNode('action', this.compact(label) + " action", {
      sourceText,
      nodeKind: 'action',
    });
    return { entry: id, exits: [id] };
  }

  visitIf(stmt: IfStatement): BuildResult {
    const decisionId = this.writer.addFlowNode('decision', this.compact(stmt.getExpression().getText()) + " if", {
      sourceText: stmt.getText(),
      nodeKind: 'decision',
    });

    const thenResult = this.visitBranch(stmt.getThenStatement());
    const elseStmt = stmt.getElseStatement();
    const elseResult = elseStmt
      ? this.visitBranch(elseStmt)
      : undefined;

    const mergeId = this.writer.addFlowNode('merge', '');

    if (thenResult.entry) {
      this.writer.addEdge(decisionId, thenResult.entry, 'yes');
      for (const exit of thenResult.exits) this.writer.addEdge(exit, mergeId);
    } else {
      this.writer.addEdge(decisionId, mergeId, 'yes');
    }

    if (elseResult?.entry) {
      this.writer.addEdge(decisionId, elseResult.entry, 'no');
      for (const exit of elseResult.exits) this.writer.addEdge(exit, mergeId);
    } else {
      this.writer.addEdge(decisionId, mergeId, 'no');
    }

    return { entry: decisionId, exits: [mergeId] };
  }

  visitWhile(stmt: WhileStatement): BuildResult {
    const decisionId = this.writer.addFlowNode('decision', this.compact(stmt.getExpression().getText()) + " while", {
      sourceText: stmt.getText(),
      nodeKind: 'decision',
    });

    const body = this.visitBranch(stmt.getStatement());

    if (body.entry) {
      this.writer.addEdge(decisionId, body.entry, 'yes');
      for (const exit of body.exits) {
        this.writer.addEdge(exit, decisionId, '', 'dashed');
      }
    } else {
      this.writer.addEdge(decisionId, decisionId, 'yes');
    }

    const afterId = this.writer.addFlowNode('merge', '');
    this.writer.addEdge(decisionId, afterId, 'no');

    return { entry: decisionId, exits: [afterId] };
  }

  visitFor(stmt: ForStatement): BuildResult {
    let firstEntry: string | undefined;

    const initializer = stmt.getInitializer();
    if (initializer) {
      firstEntry = this.writer.addFlowNode('action', this.compact(initializer.getText()) + " for", {
        sourceText: stmt.getText(),
        nodeKind: 'action',
      });
    }

    const decisionId = this.writer.addFlowNode(
      'decision',
      this.compact(stmt.getCondition()?.getText() ?? 'for') + " for",
    );

    if (firstEntry) {
      this.writer.addEdge(firstEntry, decisionId);
    } else {
      firstEntry = decisionId;
    }

    const body = this.visitBranch(stmt.getStatement());
    const incrementor = stmt.getIncrementor();

    let incrementId: string | undefined;
    if (incrementor) {
      incrementId = this.writer.addFlowNode('action', this.compact(incrementor.getText()) + " for"  , {
        sourceText: stmt.getText(),
        nodeKind: 'action',
      });
    }

    if (body.entry) {
      this.writer.addEdge(decisionId, body.entry, 'yes');
      for (const exit of body.exits) {
        if (incrementId) this.writer.addEdge(exit, incrementId);
        else this.writer.addEdge(exit, decisionId);
      }
    } else {
      if (incrementId) this.writer.addEdge(decisionId, incrementId, 'yes');
      else this.writer.addEdge(decisionId, decisionId, 'yes');
    }

    if (incrementId) {
      this.writer.addEdge(incrementId, decisionId);
    }

    const afterId = this.writer.addFlowNode('merge', '');
    this.writer.addEdge(decisionId, afterId, 'no');

    return { entry: firstEntry, exits: [afterId] };
  }

  visitBranch(node: MorphNode): BuildResult {
    if (MorphNode.isBlock(node)) {
      return this.visitStatements(node.getStatements());
    }

    if (MorphNode.isStatement(node)) {
      return this.visitStatement(node);
    }

    return this.visitAction(node.getText());
  }
}
